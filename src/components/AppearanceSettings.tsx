import { useTheme } from "../ThemeProvider";
import type { ThemePreference } from "../theme";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
}[] = [
  { value: "light", label: "Light", description: "Light background at all times" },
  { value: "dark", label: "Dark", description: "Dark background at all times" },
  { value: "system", label: "System", description: "Match your device preference" },
];

export function AppearanceSettings() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Appearance</h3>
      <p className="hint settings-hint">
        Currently using <strong>{resolved}</strong> theme
        {preference === "system" ? " (from system)" : ""}.
      </p>
      <div className="settings-options settings-options-horizontal" role="radiogroup" aria-label="Color theme">
        {OPTIONS.map(({ value, label, description }) => (
          <label
            key={value}
            className="settings-option"
            title={description}
            aria-label={`${label}: ${description}`}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => setPreference(value)}
            />
            <span className="settings-option-label">{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
