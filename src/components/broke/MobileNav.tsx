'use client';

import Link from 'next/link';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  navLinks: { href: string; label: string }[];
  isActive: (href: string) => boolean;
}

export default function MobileNav({ isOpen, onClose, navLinks, isActive }: MobileNavProps) {
  return (
    <ul className={`broke-nav-mobile broke-mobile-only ${isOpen ? 'open' : ''}`}>
      {navLinks.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className={isActive(link.href) ? 'active' : ''}
            onClick={onClose}
          >
            {link.label}
          </Link>
        </li>
      ))}
      <li className="copyright">Broke 2021. All rights reserved.</li>
    </ul>
  );
}
