import { useAppSettings } from "../AppSettingsProvider";
import { IconButton } from "./IconButton";
import { SettingsIcon } from "./icons";

type Props = {
  className?: string;
  label?: string;
};

export function SettingsButton({ className, label = "Settings" }: Props) {
  const { openSettings } = useAppSettings();

  return (
    <IconButton tooltip={label} className={className} onClick={openSettings}>
      <SettingsIcon />
    </IconButton>
  );
}
