import React, { useState } from 'react';
import { Bell, X } from 'lucide-react';

export default function ReminderBar({ reminders, setView, setViewingLead }) {
  const [dismissed, setDismissed] = useState(false);
  const total = reminders.appts.length + reminders.tasks.length;
  if (dismissed || total === 0) return null;

  return (
    <div className="bg-gradient-to-r from-sail-green to-sail-green-deep text-white border-b border-black/20">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
            <Bell className="w-3.5 h-3.5" />
          </div>
          <div className="text-sm min-w-0">
            <span className="font-medium">You have </span>
            {reminders.tasks.length > 0 && (
              <span className="font-semibold">
                {reminders.tasks.length} follow-up task{reminders.tasks.length > 1 ? 's' : ''}
              </span>
            )}
            {reminders.tasks.length > 0 && reminders.appts.length > 0 && <span> and </span>}
            {reminders.appts.length > 0 && (
              <span className="font-semibold">
                {reminders.appts.length} appointment{reminders.appts.length > 1 ? 's' : ''} in the next 3 days
              </span>
            )}
            <span className="text-white/75">.</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {reminders.tasks.length > 0 && (
            <button
              type="button"
              onClick={() => setViewingLead(reminders.tasks[0].lead)}
              className="px-3 py-1 bg-white text-sail-ink text-xs font-medium rounded-md hover:bg-white/90"
            >
              View first task
            </button>
          )}
          {reminders.appts.length > 0 && (
            <button
              type="button"
              onClick={() => setView('calendar')}
              className="px-3 py-1 bg-white/15 text-white text-xs font-medium rounded-md hover:bg-white/25"
            >
              Calendar
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1 text-white/60 hover:text-white"
            aria-label="Dismiss reminders"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
