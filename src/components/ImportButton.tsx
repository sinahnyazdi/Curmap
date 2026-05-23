import { IconButton } from "./IconButton";
import { ImportIcon } from "./icons";

type Props = {
  onClick: () => void;
  className?: string;
  label?: string;
};

export function ImportButton({ onClick, className, label = "Import" }: Props) {
  return (
    <IconButton tooltip={label} className={className} onClick={onClick}>
      <ImportIcon />
    </IconButton>
  );
}
