"use client";

import React, { useRef, useEffect } from "react";

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

export default function OtpInput({
  value = "",
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const prevValueRef = useRef(value);

  // Auto focus saat komponen dimuat
  useEffect(() => {
    if (autoFocus && !disabled) {
      const focusIndex = Math.min(value.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
    }
  }, [autoFocus, disabled, length]);

  // Fokus kembali ke kotak pertama saat value dikosongkan (setOtpCode(""))
  useEffect(() => {
    if (prevValueRef.current && value === "" && !disabled) {
      inputRefs.current[0]?.focus();
    }
    prevValueRef.current = value;
  }, [value, disabled]);

  const digits = value.split("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const raw = e.target.value;
    const clean = raw.replace(/\D/g, "");

    if (!clean) {
      // Input kosong atau non-digit
      const chars = value.split("");
      chars[index] = "";
      onChange(chars.join(""));
      return;
    }

    // Menangani paste / autofill SMS lebih dari 1 digit
    if (clean.length > 1) {
      if (clean.length >= length || clean.length > 2) {
        const nextValue = clean.slice(0, length);
        onChange(nextValue);
        const targetIndex = Math.min(nextValue.length, length - 1);
        inputRefs.current[targetIndex]?.focus();
        return;
      }

      // 2 digit akibat penimpaan karakter: ambil digit paling baru
      const newChar = clean.slice(-1);
      const chars = value.split("");
      chars[index] = newChar;
      const nextValue = chars.join("").slice(0, length);
      onChange(nextValue);

      if (index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
      return;
    }

    // Tepat 1 digit angka valid (0-9)
    const chars = value.split("");
    chars[index] = clean;
    const nextValue = chars.join("").slice(0, length);
    onChange(nextValue);

    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const chars = value.split("");
      if (chars[index]) {
        // Kotak berisi: hapus digit di kotak ini
        chars[index] = "";
        onChange(chars.join(""));
      } else if (index > 0) {
        // Kotak kosong: pindah ke kotak sebelumnya dan hapus digitnya
        chars[index - 1] = "";
        onChange(chars.join(""));
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
      return;
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pasted.length > 0) {
      const nextValue = pasted.slice(0, length);
      onChange(nextValue);
      const targetIndex = Math.min(nextValue.length, length - 1);
      inputRefs.current[targetIndex]?.focus();
    }
  };

  const handleFocus = (index: number) => {
    // Hindari celah: jangan izinkan lompat melewati kotak kosong pertama
    const firstEmptyIndex = value.length;
    if (firstEmptyIndex < length && index > firstEmptyIndex) {
      inputRefs.current[firstEmptyIndex]?.focus();
      return;
    }
    inputRefs.current[index]?.select();
  };

  const handleClick = (index: number) => {
    const firstEmptyIndex = value.length;
    if (firstEmptyIndex < length && index > firstEmptyIndex) {
      inputRefs.current[firstEmptyIndex]?.focus();
      return;
    }
    inputRefs.current[index]?.select();
  };

  return (
    <div
      role="group"
      aria-label="Kode OTP 6 Digit"
      className="flex items-center justify-center gap-2 sm:gap-3 my-2"
    >
      {Array.from({ length }).map((_, index) => {
        const digit = digits[index] || "";
        return (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={length}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ke-${index + 1} dari ${length}`}
            value={digit}
            disabled={disabled}
            onChange={(e) => handleInputChange(e, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onPaste={handlePaste}
            onFocus={() => handleFocus(index)}
            onClick={() => handleClick(index)}
            className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-mono font-semibold text-black bg-[#f4f4f5] border border-transparent rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-black transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed select-all"
          />
        );
      })}
    </div>
  );
}
