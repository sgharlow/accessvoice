import { useState, useCallback, Ref } from "react";

interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled: boolean;
  placeholder: string;
  inputRef?: Ref<HTMLInputElement>;
}

export default function TextInput({
  onSubmit,
  disabled,
  placeholder,
  inputRef,
}: TextInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed && !disabled) {
        onSubmit(trimmed);
        setValue("");
      }
    },
    [value, disabled, onSubmit]
  );

  return (
    <form className="text-input-form" onSubmit={handleSubmit} role="search">
      <label htmlFor="text-input" className="sr-only">
        Type a command or question
      </label>
      <input
        ref={inputRef}
        id="text-input"
        type="text"
        className="text-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Type a command or question"
        autoComplete="off"
      />
      <button
        type="submit"
        className="btn btn-send"
        disabled={disabled || !value.trim()}
        aria-label="Send message"
      >
        Send
      </button>
    </form>
  );
}
