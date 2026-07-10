"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type ModalTypes = {
  children: React.ReactNode;
  show?: boolean;
  onClose?: () => void;
  selector: string;
};

const Modal = ({ children, selector, show }: ModalTypes) => {
  useEffect(() => {
    if (show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [selector, show]);

  const target =
    typeof document === "undefined" ? null : document.getElementById(selector);

  return show && target ? createPortal(children, target) : null;
};
export default Modal;
