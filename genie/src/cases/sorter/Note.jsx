// 案例库编辑器里的一小块（只给员工看）：这个案例是「案例整理」从哪个文件夹整理出来的时候，记下的城市、系列、提到的材料。
// 资料在这台电脑的 IndexedDB（genie-sorter / notes），不在案例里、不进案例包 —— 之后有了板材色卡，员工照着它对应材质。
import { useEffect, useState } from 'react';
import { FolderTree } from 'lucide-react';
import { t, L, isEn } from '../../shared/i18n.js';
import DATA from './data.json';
import { get } from './cache.js';
import './note.css';

export default function SorterNote({ id }) {
  const [n, setN] = useState(null);
  useEffect(() => {
    let alive = true;
    setN(null);
    if (id) get('notes', id).then((x) => alive && setN(x || null)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  if (!n) return null;
  const series = (n.series || []).map((s) => DATA.series.find((x) => x.id === s)).filter(Boolean);
  const boards = n.boards || [];
  const city = n.city ? (isEn() ? DATA.cityEn?.[n.city] || n.city : n.city) : '';
  return (
    <aside className="so-mgnote" aria-label={t('整理时记下的（只给员工看）')}>
      <FolderTree size={15} strokeWidth={1.8} aria-hidden="true" />
      <div>
        <b>{t('整理时记下的（只给员工看）')}</b>
        <p>
          {[
            city && t('城市：{0}', [city]),
            series.length > 0 && t('系列：{0}', [series.map((s) => L(s)).join(' · ')]),
            boards.length > 0 && t('提到的材料：{0}', [boards.map((b) => `${b.name}${b.variant || ''}${b.code ? ' ' + b.code : ''}`).join(' · ')]),
            (n.materials || []).length > 0 && t('其它字：{0}', [n.materials.join(' · ')]),
            (n.raw || []).length > 0 && t('风格词：{0}', [n.raw.join(' · ')]),
            t('原来有 {0} 张照片', [n.photos || 0]),
          ]
            .filter(Boolean)
            .join(isEn() ? ' · ' : ' · ')}
        </p>
      </div>
    </aside>
  );
}
