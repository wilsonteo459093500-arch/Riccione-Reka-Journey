// 员工 · 板材（cases.html?staff=1&boards=1）：板材库 ⇄ 板材导入（&import=1）。单独的 chunk，案例库本身不变重。
// 从案例库（已经按住 3 秒解锁）的「板材 · Boards」进来；许愿模式里没有任何路到这里。
import './words.js'; // 界面的英文（en-boards.js）先并进词典：一定要是第一个 import
import { useEffect, useState } from 'react';
import { t } from '../../shared/i18n.js';
import BoardLibrary from './BoardLibrary.jsx';
import BoardImporter from './BoardImporter.jsx';
import { useAsk, useToast, isTouchDevice } from './ui.jsx';
import '../sorter/sorter.css';
import './boards.css';

const wantsImport = () => new URLSearchParams(location.search).get('import') === '1' && !isTouchDevice();

export default function BoardsApp() {
  const [view, setView] = useState(wantsImport() ? 'import' : 'library');
  const [askCard, ask] = useAsk();
  const [toast, flash] = useToast();
  useEffect(() => {
    document.title = `${view === 'import' ? t('板材导入') : t('板材库')} · WISH`;
  }, [view]);
  useEffect(() => {
    const onPop = () => setView(wantsImport() ? 'import' : 'library');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (v) => {
    const q = new URLSearchParams(location.search);
    if (v === 'import') q.set('import', '1');
    else q.delete('import');
    history.pushState(null, '', `${location.pathname}?${q}`);
    setView(v);
    window.scrollTo(0, 0);
  };
  return (
    <>
      {view === 'import' ? <BoardImporter onBack={() => go('library')} onLibrary={() => go('library')} flash={flash} ask={ask} /> : <BoardLibrary onImport={() => go('import')} flash={flash} ask={ask} />}
      {toast}
      {askCard}
    </>
  );
}
