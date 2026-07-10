import { motion } from "framer-motion";
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <div className="field-shell flex w-full flex-wrap items-center justify-between p-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      <motion.div
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
        className={`flex w-10 items-center rounded-full border ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${checked ? "border-pirrot-green-400 bg-pirrot-green-300" : "border-pirrot-blue-200 bg-pirrot-blue-50"}`}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <motion.div
          className="bg-info-950 size-5 rounded-full"
          animate={{ x: checked ? 18 : 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 15,
            mass: 0.5,
          }}
        />
      </motion.div>
    </div>
  );
}
