import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_TEAM } from '../constants/team.js';
import { newId } from '../utils/helpers.js';

// Manages the editable team roster + role label overrides.
// Falls back to DEFAULT_TEAM if nothing has been saved yet.
export function useTeam(repo, { onToast } = {}) {
  const [team, setTeam] = useState(DEFAULT_TEAM);
  const [loading, setLoading] = useState(true);
  const ref = useRef(DEFAULT_TEAM);

  const setRef = (next) => {
    ref.current = next;
    setTeam(next);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    repo
      .loadTeam()
      .then((t) => {
        if (alive) {
          setRef(t || DEFAULT_TEAM);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setRef(DEFAULT_TEAM);
          setLoading(false);
        }
      });

    const unsub = repo.subscribeTeam?.(async () => {
      try {
        const t = await repo.loadTeam();
        if (alive) setRef(t || DEFAULT_TEAM);
      } catch (e) { /* ignore */ }
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
        await repo.saveTeam(next);
      } catch (e) {
        onToast?.('团队设置保存失败: ' + (e.message || e), 'error');
      }
    },
    [repo, onToast]
  );

  const addMember = useCallback(
    (member) => {
      const m = { id: newId('m'), name: '', role: 'SD', whatsapp: '', email: '', ...member };
      const next = { ...ref.current, members: [...ref.current.members, m] };
      setRef(next);
      persist(next);
    },
    [persist]
  );

  const updateMember = useCallback(
    (id, updates) => {
      const next = {
        ...ref.current,
        members: ref.current.members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      };
      setRef(next);
      persist(next);
    },
    [persist]
  );

  const removeMember = useCallback(
    (id) => {
      const next = {
        ...ref.current,
        members: ref.current.members.filter((m) => m.id !== id),
      };
      setRef(next);
      persist(next);
    },
    [persist]
  );

  const updateRoleLabel = useCallback(
    (code, updates) => {
      const next = {
        ...ref.current,
        roleLabels: {
          ...ref.current.roleLabels,
          [code]: { ...ref.current.roleLabels[code], ...updates },
        },
      };
      setRef(next);
      persist(next);
    },
    [persist]
  );

  const resetToDefaults = useCallback(() => {
    setRef(DEFAULT_TEAM);
    persist(DEFAULT_TEAM);
  }, [persist]);

  return { team, loading, addMember, updateMember, removeMember, updateRoleLabel, resetToDefaults };
}
