import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from '../utils/helpers.js';

// Standalone hook for appointments. Same shape as useProjects but
// smaller — appointments are always a flat list, no migrations.
export function useAppointments(repo, { onToast } = {}) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef([]);

  const setRef = (next) => {
    ref.current = next;
    setAppointments(next);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    repo
      .loadAppointments()
      .then((list) => {
        if (alive) {
          setRef(list || []);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setLoading(false);
          onToast?.('日历载入失败: ' + (e.message || e), 'error');
        }
      });

    const unsub = repo.subscribeAppointments(async () => {
      try {
        const list = await repo.loadAppointments();
        if (alive) setRef(list || []);
      } catch (e) { /* ignore transient refetch errors */ }
    });

    return () => {
      alive = false;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  const persist = useCallback(
    async (next) => {
      try {
        await repo.saveAppointments(next);
      } catch (e) {
        onToast?.('日历保存失败: ' + (e.message || e), 'error');
      }
    },
    [repo, onToast]
  );

  const addAppointment = useCallback(
    (data) => {
      const appt = {
        ...data,
        id: newId('appt'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const next = [appt, ...ref.current];
      setRef(next);
      persist(next);
      return appt;
    },
    [persist]
  );

  const updateAppointment = useCallback(
    (id, updates) => {
      const next = ref.current.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
      );
      setRef(next);
      persist(next);
    },
    [persist]
  );

  const deleteAppointment = useCallback(
    (id) => {
      const next = ref.current.filter((a) => a.id !== id);
      setRef(next);
      persist(next);
    },
    [persist]
  );

  return { appointments, loading, addAppointment, updateAppointment, deleteAppointment };
}
