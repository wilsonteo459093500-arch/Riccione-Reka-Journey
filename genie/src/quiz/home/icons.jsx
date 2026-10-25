// 「你的家」的线描小图（房子类型、房子现在的状态）。颜色全部来自 home.css（.hj-type svg：墨色线 + 很淡的金色填充 + 苔绿的窗）。

const HOUSES = {
  condo: (
    <>
      <rect className="fill" x="30" y="6" width="32" height="54" rx="2" />
      <rect x="30" y="6" width="32" height="54" rx="2" />
      <path d="M36 14h6M50 14h6M36 22h6M50 22h6M36 30h6M50 30h6M36 38h6M50 38h6" />
      <path className="win" d="M42 48h8v12h-8z" />
      <path d="M14 60h64" />
      <path d="M18 60V40h12M74 60V44H62" />
    </>
  ),
  terrace: (
    <>
      <path className="fill" d="M8 30 22 18l14 12 14-12 14 12 14-12 6 6v38H8z" />
      <path d="M8 60V30l14-12 14 12 14-12 14 12 14-12 6 6v36" />
      <path d="M36 30v30M64 30v30" />
      <path className="win" d="M17 44h10v16H17zM45 44h10v16H45zM73 44h8v16h-8z" />
      <path d="M4 60h86" />
    </>
  ),
  // 单层排屋：一排矮矮的、连在一起的屋顶
  terrace1: (
    <>
      <path className="fill" d="M6 40 18 30l12 10 12-10 12 10 12-10 12 10 8 0v20H6z" />
      <path d="M6 60V40l12-10 12 10 12-10 12 10 12-10 12 10h8v20" />
      <path d="M30 40v20M54 40v20M78 40v20" />
      <path className="win" d="M12 48h8v12h-8zM36 48h8v12h-8zM60 48h8v12h-8z" />
      <path d="M2 60h88" />
    </>
  ),
  semid: (
    <>
      <path className="fill" d="M12 32 46 10l34 22v28H12z" />
      <path d="M12 60V32L46 10l34 22v28" />
      <path d="M46 10v50" />
      <path className="win" d="M22 40h12v10H22zM58 40h12v10H58z" />
      <path d="M6 60h80" />
    </>
  ),
  bungalow: (
    <>
      <path className="fill" d="M6 34 30 16h34l22 18v26H6z" />
      <path d="M6 60V34l24-18h34l22 18v26" />
      <path className="win" d="M16 42h14v10H16zM40 42h12v18H40zM62 42h14v10H62z" />
      <path d="M2 60h88" />
      <path d="M78 24c4-6 10-6 12-2" />
    </>
  ),
  townhouse: (
    <>
      <path className="fill" d="M14 22 46 8l32 14v38H14z" />
      <path d="M14 60V22L46 8l32 14v38" />
      <path d="M14 40h64" />
      <path className="win" d="M24 26h12v8H24zM56 26h12v8H56zM24 46h12v14H24zM56 46h12v8H56z" />
      <path d="M8 60h76" />
    </>
  ),
  // 店屋：楼下是店面（卷帘门），楼上住人
  shophouse: (
    <>
      <path className="fill" d="M14 14h64v46H14z" />
      <path d="M14 60V14h64v46" />
      <path d="M14 22h64M14 38h64M46 14v24" />
      <path className="win" d="M22 26h16v8H22zM54 26h16v8H54z" />
      <path d="M22 60V44h48v16M22 49h48M22 54h48" />
      <path d="M8 60h76" />
    </>
  ),
  other: (
    <>
      <path className="fill" d="M16 20h60v40H16z" />
      <path d="M16 60V20h60v40" />
      <path d="M16 32h60" />
      <path className="win" d="M24 40h14v20H24zM50 40h18v10H50z" />
      <path d="M10 60h72" />
      <path d="M28 12h36l12 8H16z" />
    </>
  ),
};

// 房子现在的状态：刚拿钥匙（钥匙 + 门）· 住着翻新（有沙发的家）· 还在建（脚手架）· 还在看房（放大镜 + 房子）
const STATUS = {
  handover: (
    <>
      <path className="fill" d="M20 26 46 8l26 18v34H20z" />
      <path d="M20 60V26L46 8l26 18v34" />
      <path className="win" d="M40 40h12v20H40z" />
      <circle cx="70" cy="46" r="6" />
      <path d="M70 52v8M70 56h4" />
      <path d="M12 60h68" />
    </>
  ),
  living: (
    <>
      <path className="fill" d="M14 26 46 8l32 18v34H14z" />
      <path d="M14 60V26L46 8l32 18v34" />
      <path className="win" d="M26 44h40v8H26z" />
      <path d="M24 52v-10a4 4 0 0 1 4-4h36a4 4 0 0 1 4 4v10M30 52v4M62 52v4" />
      <path d="M8 60h76" />
    </>
  ),
  building: (
    <>
      <path className="fill" d="M22 22h48v38H22z" />
      <path d="M22 60V22h48v38" strokeDasharray="4 3" />
      <path d="M14 60V14M78 60V14M14 22h64M14 40h64" />
      <path className="win" d="M34 30h10v6H34zM50 30h10v6H50z" />
      <path d="M8 60h76" />
    </>
  ),
  looking: (
    <>
      <path className="fill" d="M12 32 34 16l22 16v28H12z" />
      <path d="M12 60V32l22-16 22 16v28" />
      <path className="win" d="M28 44h12v16H28z" />
      <circle cx="66" cy="30" r="10" />
      <path d="M73 37l9 9" />
      <path d="M6 60h56" />
    </>
  ),
};

export function HouseArt({ kind, set = 'type' }) {
  const g = (set === 'status' ? STATUS : HOUSES)[kind] || HOUSES.other;
  return (
    <svg viewBox="0 0 92 64" aria-hidden="true">
      {g}
    </svg>
  );
}

/** 案例卡上的小星星（理由那一行） */
export function Spark({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" />
    </svg>
  );
}
