// ble_remote.c —— 见 ble_remote.h
//
// 用 ESP-IDF 的 esp_hid（NimBLE 版）建 HID / 电量 / 装置资讯三个服务，这里只管：
//   广播（名字、外观「HID」、0x1812）、配对（Just Works + 绑定）、断线后重新广播、回报状态。
// 参考：ESP-IDF examples/bluetooth/esp_hid_device（NimBLE 分支）。
#include "ble_remote.h"

#include <string.h>

#include "esp_hidd.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "services/gap/ble_svc_gap.h"

static const char *TAG = "ble_remote";

void ble_store_config_init(void);   // NimBLE 的 NVS 绑定资料（没有公开标头，范例也是这样宣告）

#define REPORT_ID 1
#define HID_UUID16 0x1812

// Consumer Control：一个 16 位元的用法码（array）。0 = 放开。
static const uint8_t REPORT_MAP[] = {
    0x05, 0x0C,        // Usage Page (Consumer)
    0x09, 0x01,        // Usage (Consumer Control)
    0xA1, 0x01,        // Collection (Application)
    0x85, REPORT_ID,   //   Report ID (1)
    0x15, 0x00,        //   Logical Minimum (0)
    0x26, 0xFF, 0x03,  //   Logical Maximum (0x3FF)
    0x19, 0x00,        //   Usage Minimum (0)
    0x2A, 0xFF, 0x03,  //   Usage Maximum (0x3FF)
    0x75, 0x10,        //   Report Size (16)
    0x95, 0x01,        //   Report Count (1)
    0x81, 0x00,        //   Input (Data, Array, Abs)
    0xC0,              // End Collection
};

static esp_hid_raw_report_map_t s_maps[] = { { .data = REPORT_MAP, .len = sizeof(REPORT_MAP) } };

static esp_hid_device_config_t s_config = {
    .vendor_id = 0x303A,          // Espressif 的 USB VID（PnP ID 只是让手机认得是 HID，不影响功能）
    .product_id = 0x8000,
    .version = 0x0100,
    .device_name = "SPACE Remote",
    .manufacturer_name = "SPACE",
    .serial_number = "0001",
    .report_maps = s_maps,
    .report_maps_len = 1,
};

static esp_hidd_dev_t *s_dev;
static volatile car_link_t s_link = CAR_LINK_STARTING;
static volatile uint16_t s_conn = BLE_HS_CONN_HANDLE_NONE;
static uint8_t s_addr_type;
static struct ble_hs_adv_fields s_fields;
static ble_uuid16_t s_hid_uuid = BLE_UUID16_INIT(HID_UUID16);

static int gap_event(struct ble_gap_event *event, void *arg);

// ---- SPACE 车控通道 ----
// UUID 8d6f000X-6b3a-4c2e-9a51-535041434552（最后 6 bytes 是 "SPACER"），NimBLE 要 little-endian
#define SPACE_UUID(x) BLE_UUID128_INIT(0x52, 0x45, 0x43, 0x41, 0x50, 0x53, 0x51, 0x9a, 0x2e, 0x4c, 0x3a, 0x6b, x, 0x00, 0x6f, 0x8d)
static const ble_uuid128_t s_svc_uuid = SPACE_UUID(0x01);
static const ble_uuid128_t s_evt_uuid = SPACE_UUID(0x02);
static const ble_uuid128_t s_cmd_uuid = SPACE_UUID(0x03);
static uint16_t s_evt_handle;
static volatile bool s_app_present;

#define CMD_MAX 32
typedef struct {
    uint8_t len;
    uint8_t data[CMD_MAX];
} cmd_msg_t;
static QueueHandle_t s_cmds;

static int space_chr_access(uint16_t conn_handle, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt, void *arg) {
    (void)conn_handle;
    (void)attr_handle;
    (void)arg;
    if (ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR) return BLE_ATT_ERR_UNLIKELY;
    cmd_msg_t m = { 0 };
    const uint16_t n = OS_MBUF_PKTLEN(ctxt->om);
    if (n == 0 || n > CMD_MAX) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    if (ble_hs_mbuf_to_flat(ctxt->om, m.data, sizeof m.data, NULL) != 0) return BLE_ATT_ERR_UNLIKELY;
    m.len = (uint8_t)n;
    if (s_cmds) (void)xQueueSend(s_cmds, &m, 0);   // 满了就丢（画面 250ms 取一次，正常不会满）
    return 0;
}

static const struct ble_gatt_svc_def s_space_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &s_svc_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            { .uuid = &s_evt_uuid.u, .access_cb = space_chr_access, .val_handle = &s_evt_handle,
              .flags = BLE_GATT_CHR_F_NOTIFY },
            { .uuid = &s_cmd_uuid.u, .access_cb = space_chr_access,
              .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP | BLE_GATT_CHR_F_WRITE_ENC },
            { 0 },
        },
    },
    { 0 },
};

static void advertise(void) {
    struct ble_gap_adv_params params = { 0 };
    params.conn_mode = BLE_GAP_CONN_MODE_UND;
    params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    params.itvl_min = BLE_GAP_ADV_ITVL_MS(30);
    params.itvl_max = BLE_GAP_ADV_ITVL_MS(50);
    int rc = ble_gap_adv_set_fields(&s_fields);
    if (rc == 0) rc = ble_gap_adv_start(s_addr_type, NULL, BLE_HS_FOREVER, &params, gap_event, NULL);
    if (rc == 0 || rc == BLE_HS_EALREADY) {
        s_link = CAR_LINK_ADVERTISING;
    } else {
        ESP_LOGE(TAG, "广播失败：%d", rc);
        s_link = CAR_LINK_ERROR;
    }
}

static int gap_event(struct ble_gap_event *event, void *arg) {
    (void)arg;
    struct ble_gap_conn_desc desc;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0) {
            s_conn = event->connect.conn_handle;
            s_link = CAR_LINK_CONNECTED;
            ESP_LOGI(TAG, "手机连上了，开始加密 / 配对");
            // 已绑定 → 直接用存的金钥加密；没绑定 → Just Works 配对（手机会跳确认）
            ble_gap_security_initiate(event->connect.conn_handle);
        } else {
            advertise();
        }
        return 0;
    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.attr_handle == s_evt_handle) {
            s_app_present = event->subscribe.cur_notify;
            ESP_LOGI(TAG, "SPACE 车控 app %s", s_app_present ? "连上了" : "离开了");
        }
        return 0;
    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGI(TAG, "断线（reason=%d），重新广播", event->disconnect.reason);
        s_conn = BLE_HS_CONN_HANDLE_NONE;
        s_app_present = false;
        advertise();
        return 0;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        if (s_conn == BLE_HS_CONN_HANDLE_NONE) advertise();
        return 0;
    case BLE_GAP_EVENT_ENC_CHANGE:
        if (event->enc_change.status == 0) {
            s_link = CAR_LINK_READY;
            ESP_LOGI(TAG, "加密完成，可以用了");
        } else {
            ESP_LOGW(TAG, "加密失败：%d（手机上「取消配对」再配一次）", event->enc_change.status);
        }
        return 0;
    case BLE_GAP_EVENT_REPEAT_PAIRING:
        // 手机删了配对又重配：丢掉旧的绑定，接受新的
        if (ble_gap_conn_find(event->repeat_pairing.conn_handle, &desc) == 0) {
            ble_store_util_delete_peer(&desc.peer_id_addr);
        }
        return BLE_GAP_REPEAT_PAIRING_RETRY;
    case BLE_GAP_EVENT_PASSKEY_ACTION: {
        // Just Works 理论上不会到这里；万一手机要求数字比对，就接受
        struct ble_sm_io io = { 0 };
        io.action = event->passkey.params.action;
        if (io.action == BLE_SM_IOACT_NUMCMP) {
            io.numcmp_accept = 1;
            ble_sm_inject_io(event->passkey.conn_handle, &io);
        }
        return 0;
    }
    default:
        return 0;
    }
}

// esp_hid 的事件：host 同步好了（START）→ 开始广播
static void hidd_event(void *handler_args, esp_event_base_t base, int32_t id, void *event_data) {
    (void)handler_args;
    (void)base;
    (void)event_data;
    if ((esp_hidd_event_t)id == ESP_HIDD_START_EVENT) {
        int rc = ble_hs_util_ensure_addr(0);
        if (rc == 0) rc = ble_hs_id_infer_auto(0, &s_addr_type);
        if (rc != 0) {
            ESP_LOGE(TAG, "蓝牙地址设定失败：%d", rc);
            s_link = CAR_LINK_ERROR;
            return;
        }
        advertise();
    }
}

static void host_task(void *param) {
    (void)param;
    nimble_port_run();   // nimble_port_stop() 才会回来（这个 app 不会停）
    nimble_port_freertos_deinit();
}

bool ble_remote_start(const char *device_name) {
    if (device_name && device_name[0]) s_config.device_name = device_name;
    s_link = CAR_LINK_STARTING;

    esp_err_t err = nimble_port_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nimble_port_init 失败：%s", esp_err_to_name(err));
        s_link = CAR_LINK_ERROR;
        return false;
    }

    // 配对：没有萤幕可以输入 → Just Works；要绑定，下次自动重连
    ble_hs_cfg.sm_io_cap = BLE_SM_IO_CAP_NO_IO;
    ble_hs_cfg.sm_bonding = 1;
    ble_hs_cfg.sm_mitm = 0;
    ble_hs_cfg.sm_sc = 1;
    ble_hs_cfg.sm_our_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
    ble_hs_cfg.sm_their_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;

    // 建 HID / 电量 / 装置资讯服务（esp_hid 会设 sync_cb，同步好发 START 事件）
    err = esp_hidd_dev_init(&s_config, ESP_HID_TRANSPORT_BLE, hidd_event, &s_dev);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "HID 服务建立失败：%s", esp_err_to_name(err));
        s_link = CAR_LINK_ERROR;
        return false;
    }
    // SPACE 车控通道（跟 HID 同一个 GATT 资料库；esp_hid 只处理 16 位元的 HID UUID，不会碰它）
    s_cmds = xQueueCreate(8, sizeof(cmd_msg_t));
    int rc = ble_gatts_count_cfg(s_space_svcs);
    if (rc == 0) rc = ble_gatts_add_svcs(s_space_svcs);
    if (rc != 0) ESP_LOGE(TAG, "SPACE 车控通道建立失败：%d（媒体键照样能用）", rc);
    ble_svc_gap_device_name_set(s_config.device_name);
    ble_svc_gap_device_appearance_set(ESP_HID_APPEARANCE_GENERIC);

    memset(&s_fields, 0, sizeof s_fields);
    s_fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    s_fields.appearance = ESP_HID_APPEARANCE_GENERIC;
    s_fields.appearance_is_present = 1;
    s_fields.name = (const uint8_t *)s_config.device_name;
    s_fields.name_len = (uint8_t)strlen(s_config.device_name);
    s_fields.name_is_complete = 1;
    s_fields.uuids16 = &s_hid_uuid;
    s_fields.num_uuids16 = 1;
    s_fields.uuids16_is_complete = 1;

    ble_store_config_init();
    ble_hs_cfg.store_status_cb = ble_store_util_status_rr;   // 绑定满了删最旧的
    nimble_port_freertos_init(host_task);
    ESP_LOGI(TAG, "蓝牙启动：%s", s_config.device_name);
    return true;
}

car_link_t ble_remote_link(void) {
    return s_link;
}

bool ble_remote_send(uint16_t usage) {
    if (!s_dev || s_link != CAR_LINK_READY || usage == 0) return false;
    uint8_t report[2];
    car_remote_report(usage, report);
    if (esp_hidd_dev_input_set(s_dev, 0, REPORT_ID, report, sizeof report) != ESP_OK) return false;
    vTaskDelay(pdMS_TO_TICKS(40));   // 按住一下再放开，手机才认得是一次按键
    car_remote_report(0, report);
    return esp_hidd_dev_input_set(s_dev, 0, REPORT_ID, report, sizeof report) == ESP_OK;
}

void ble_remote_set_battery(int percent) {
    static int last = -1;
    if (!s_dev || percent < 0 || percent == last) return;
    if (percent > 100) percent = 100;
    if (esp_hidd_dev_battery_set(s_dev, (uint8_t)percent) == ESP_OK) last = percent;
}

bool ble_remote_app_present(void) {
    return s_app_present;
}

bool ble_remote_notify_key(const uint8_t evt[2]) {
    if (!s_app_present || s_conn == BLE_HS_CONN_HANDLE_NONE) return false;
    struct os_mbuf *om = ble_hs_mbuf_from_flat(evt, 2);
    if (!om) return false;
    return ble_gatts_notify_custom(s_conn, s_evt_handle, om) == 0;
}

bool ble_remote_take_cmd(uint8_t *buf, size_t *len, size_t cap) {
    cmd_msg_t m;
    if (!s_cmds || xQueueReceive(s_cmds, &m, 0) != pdTRUE) return false;
    const size_t n = m.len < cap ? m.len : cap;
    memcpy(buf, m.data, n);
    *len = n;
    return true;
}
