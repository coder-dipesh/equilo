import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import 'cally';

/**
 * Single-date picker using Cally calendar. Use for all date fields.
 * Value and onChange use ISO date strings (YYYY-MM-DD).
 */
export default function CallyDatePicker({
  id,
  value = '',
  onChange,
  min,
  max,
  disabled = false,
  className = '',
  inputClassName = 'input input-bordered w-full pr-10 has-calendar-icon',
  ariaLabel = 'Date',
}) {
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);
  const calendarRef = useRef(null);
  const anchorRef = useRef(null);

  const CALENDAR_ESTIMATED_HEIGHT = 320;
  const CALENDAR_WIDTH = 280;
  const GAP = 8;

  function openCalendar() {
    if (disabled) return;
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < CALENDAR_ESTIMATED_HEIGHT + GAP;
      let left = rect.left;
      if (left + CALENDAR_WIDTH > window.innerWidth - 8) left = window.innerWidth - CALENDAR_WIDTH - 8;
      if (left < 8) left = 8;
      setDropdownRect({ left, openAbove, anchorRect: rect });
    }
    setOpen(true);
  }

  // Sync calendar value when popover opens and attach change listener
  useEffect(() => {
    const cal = calendarRef.current;
    if (!cal) return;
    if (open) {
      cal.setAttribute('value', value || '');
      cal.setAttribute('first-day-of-week', '1');
    }
    const handleChange = (e) => {
      const newValue = e.target?.value ?? '';
      if (newValue) {
        onChange?.({ target: { value: newValue } });
        setOpen(false);
        setDropdownRect(null);
      }
    };
    cal.addEventListener('change', handleChange);
    return () => cal.removeEventListener('change', handleChange);
  }, [open, value, onChange]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (anchorRef.current && !anchorRef.current.contains(e.target) && calendarRef.current && !calendarRef.current.contains(e.target)) {
        setOpen(false);
        setDropdownRect(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        setDropdownRect(null);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div ref={anchorRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          id={id}
          type="date"
          value={value}
          readOnly
          min={min}
          max={max}
          disabled={disabled}
          className={inputClassName}
          aria-label={ariaLabel}
          onFocus={(e) => {
            e.target.blur();
            openCalendar();
          }}
          onClick={openCalendar}
        />
        <button
          type="button"
          onClick={() => { if (open) { setOpen(false); setDropdownRect(null); } else openCalendar(); }}
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-base-200 hover:text-base-content transition-colors"
          aria-label="Open calendar"
          aria-expanded={open}
        >
          <Calendar className="w-5 h-5" aria-hidden />
        </button>
      </div>

      {open && dropdownRect && createPortal(
        <div
          className="fixed z-[300] max-h-[min(320px,70vh)] overflow-auto rounded-xl border border-base-300 bg-base-100 shadow-xl p-3 cally-date-picker-dropdown"
          style={{
            left: dropdownRect.left,
            minWidth: CALENDAR_WIDTH,
            ...(dropdownRect.openAbove
              ? { bottom: window.innerHeight - dropdownRect.anchorRect.top + GAP }
              : { top: dropdownRect.anchorRect.bottom + GAP }),
          }}
        >
          <calendar-date
            ref={calendarRef}
            value={value || ''}
            min={min || ''}
            max={max || ''}
          >
            <ChevronLeft slot="previous" className="w-5 h-5" aria-label="Previous month" />
            <ChevronRight slot="next" className="w-5 h-5" aria-label="Next month" />
            <calendar-month />
          </calendar-date>
        </div>,
        document.body,
      )}
    </div>
  );
}
