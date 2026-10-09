// 师傅链接：师傅打开主管发的链接 → 导入项目 → 直接打开今天的每日汇报；主管在项目页生成链接
import { useEffect, useRef, useState } from 'react';
import Icon from './ui/Icon.jsx';
import { Spinner, useUI } from './ui/UI.jsx';
import { useStore } from '../lib/store.jsx';
import { getTemplate } from '../templates/index.js';
import { siteLabel } from '../lib/report.js';
import { navigate } from '../lib/router.js';
import { copyText, openWhatsApp } from '../lib/share.js';
import {
  CREW_FIELDS, CREW_FIELD_LABELS, CREW_TEMPLATE, crewLink, crewMessage, crewPayloadOf, hasOwnWork, mergeCrewProject, parseCrew, todayReport,
} from '../lib/crew.js';

/** 打开（或新建）这个项目今天的每日汇报 */
export async function openCrewToday(store, project, { replace = false } = {}) {
  const t = getTemplate(CREW_TEMPLATE);
  const { report, created } = todayReport(t, project, store.reports, store.settings);
  if (created) await store.saveReport(report, { touch: false });
  navigate(`/r/${report.id}`, { replace });
}

/** 导入链接里的项目；新手机（没有自己的项目 / 报告）自动切换成师傅模式。返回项目 */
export async function importCrew(store, data) {
  const local = store.projectById(data.project.id);
  const merged = mergeCrewProject(local, data);
  const fresh = !hasOwnWork(store.projects, store.reports);
  const project = merged ? await store.saveProject(merged) : local;
  if (fresh && !store.settings.crew) await store.updateSettings({ crew: true });
  return project;
}

export default function CrewLink({ payload }) {
  const store = useStore();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const data = parseCrew(payload);
    if (!data) {
      setError('链接不完整或已损坏，请让主管重新发一次。');
      return;
    }
    importCrew(store, data)
      .then((project) => openCrewToday(store, project, { replace: true }))
      .catch((e) => setError(e?.message || '打开失败，请再点一次链接'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center p-6 text-center">
      {error ? (
        <>
          <Icon name="CircleAlert" size={32} className="text-fail" />
          <div className="mt-3 text-[17px] font-bold text-ink">打不开这个链接</div>
          <div className="mt-2 text-[14px] leading-relaxed text-ink-soft">{error}</div>
          <button className="btn-primary mt-5" onClick={() => navigate('/', { replace: true })}>
            回首页
          </button>
        </>
      ) : (
        <>
          <Spinner size={28} className="text-terra" />
          <div className="mt-3 text-[15px] text-ink-soft">正在打开今天的每日汇报…</div>
        </>
      )}
    </div>
  );
}

/** 项目页：把每日汇报链接发给安装师傅 */
export function CrewShare({ project, ensureSaved }) {
  const store = useStore();
  const { toast } = useUI();
  const included = CREW_FIELDS.filter((k) => project[k] != null && String(project[k]).trim()).map((k) => CREW_FIELD_LABELS[k]);

  const build = async () => {
    const p = (await ensureSaved?.()) || project;
    return { p, link: crewLink(p, store.settings) };
  };

  return (
    <section className="card mt-4 p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-terra/10 p-2.5 text-terra">
          <Icon name="Send" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">发给安装师傅填每日汇报</div>
          <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            你不在工地时，师傅点开链接就能填这个项目的每日汇报（拍照 / 视频），填好直接发到群里。不用注册，师傅填的内容存在师傅自己手机里。
          </div>
          <div className="mt-2 text-[12px] leading-relaxed text-ink-mute">
            链接里带：{included.join('、') || '项目名称'}。不带 SO、设计师和备注。
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className="btn-primary flex-1 py-2.5 text-[14px]"
          onClick={async () => {
            const { p, link } = await build();
            openWhatsApp(crewMessage(siteLabel(p), link));
          }}
        >
          <Icon name="MessageCircle" size={17} /> WhatsApp 发送
        </button>
        <button
          className="btn-ghost flex-1 py-2.5 text-[14px]"
          onClick={async () => {
            const { link } = await build();
            const ok = await copyText(link);
            toast(ok ? '链接已复制，可以粘贴到 WhatsApp 发给师傅' : '复制失败，请改用「WhatsApp 发送」', ok ? 'ok' : 'error');
          }}
        >
          <Icon name="Link" size={17} /> 复制链接
        </button>
      </div>
    </section>
  );
}

/** 新手机首页：粘贴主管发的链接（iPhone 主屏幕 App 和 Safari 资料分开，点链接导入不到主屏幕 App 时用） */
export function CrewPaste() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);
  if (!open) {
    return (
      <button className="mx-auto mb-6 block text-[13px] font-semibold text-terra" onClick={() => setOpen(true)}>
        安装师傅？点这里粘贴主管发的链接
      </button>
    );
  }
  const go = () => {
    if (!parseCrew(value)) return setBad(true);
    navigate(`/crew/${crewPayloadOf(value)}`);
  };
  return (
    <div className="card mb-6 p-3">
      <div className="text-[13px] text-ink-soft">把主管在 WhatsApp 发的链接长按复制，粘贴到下面：</div>
      <textarea
        className="input mt-2 resize-none text-[14px]"
        rows={3}
        value={value}
        placeholder="https://…/#/crew/…"
        onChange={(e) => {
          setValue(e.target.value);
          setBad(false);
        }}
      />
      {bad && <div className="mt-1 text-[12px] text-fail">这不是完整的师傅链接，请重新复制一次</div>}
      <button className="btn-primary mt-2 w-full py-2.5 text-[14px]" disabled={!value.trim()} onClick={go}>
        打开每日汇报
      </button>
    </div>
  );
}
