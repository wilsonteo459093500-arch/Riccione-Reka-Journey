import { useEffect, useState } from 'react';

let push = () => {};
export function toast(msg) {
  push(msg);
}

export function Toaster() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let timer;
    push = (m) => {
      setMsg(m);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2600);
    };
    return () => clearTimeout(timer);
  }, []);
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}
