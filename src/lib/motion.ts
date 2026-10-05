// iOS 风格动效体系（与主项目 motion/config 同源）：弹簧曲线 + 统一时长
import { CustomEase } from "gsap/CustomEase";
import { gsap } from "gsap";

gsap.registerPlugin(CustomEase);

// iOS 风格弹簧曲线（过冲约 15% 后稳住）
try {
  CustomEase.create("motionEnterSpring", "M0,0 C0.28,1.45 0.5,1 1,1");
} catch {
  // 重复创建会抛错，忽略
}

export const MOTION_DURATION = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.3,
  slow: 0.45,
  enter: 0.6,
  numberRoll: 1.1,
} as const;

export const MOTION_EASE = {
  enter: "motionEnterSpring",
  out: "power2.out",
  inOut: "power2.inOut",
} as const;

/** CSS 端等效弹簧曲线（过渡用） */
export const SPRING_CSS = "cubic-bezier(0.28, 1.45, 0.5, 1)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
