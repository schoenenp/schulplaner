'use client'
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ModalTypes = {
  children: React.ReactNode;
  show?: boolean;
  onClose?: () => void;
  selector: string;
};

const Modal = ({ children, selector, show }: ModalTypes) => {
  const ref = useRef<Element | null>(null);
  useEffect(() => {
    ref.current = document.getElementById(selector);
      if (show) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }


  }, [selector, show]);
  return show && ref.current ? createPortal(children, ref.current) : null;
};
export default Modal;