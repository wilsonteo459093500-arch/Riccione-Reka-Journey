idf_component_register(
    SRCS "main.c"
         "space_card.c"
         "space_card_model.c"
         "car_remote_model.c"
         "car_screen.c"
         "ble_remote.c"
    INCLUDE_DIRS "."
    REQUIRES bsp esp_timer esp_hw_support esp_system nvs_flash bt esp_hid
)
