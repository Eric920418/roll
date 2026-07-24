import Image from "next/image";

const LOGOS = {
  black: {
    src: "/nova/logo-black.png",
    width: 1800,
    height: 341,
  },
  white: {
    src: "/nova/logo-white.png",
    width: 1800,
    height: 341,
  },
  metal: {
    src: "/nova/logo-metal.png",
    width: 1443,
    height: 278,
  },
} as const;

export type NovaLogoVariant = keyof typeof LOGOS;

export default function NovaLogo({
  variant = "black",
  className,
  priority = false,
  alt = "NOVA",
  sizes,
}: {
  variant?: NovaLogoVariant;
  className?: string;
  priority?: boolean;
  alt?: string;
  sizes?: string;
}) {
  const logo = LOGOS[variant];

  return (
    <Image
      src={logo.src}
      width={logo.width}
      height={logo.height}
      alt={alt}
      priority={priority}
      sizes={sizes}
      className={className}
    />
  );
}
