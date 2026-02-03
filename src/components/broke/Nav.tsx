'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';
import MobileNav from './MobileNav';

const navLinks = [
  { href: '/broke', label: 'HOME' },
  { href: '/broke/guide', label: 'GUIDE' },
  { href: '/broke/dashboard', label: 'DASHBOARD' },
];

export default function Nav() {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/broke') {
      return pathname === '/broke';
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      <nav className="broke-nav">
        <div className="logo">
          <Link href="/broke">
            <Image
              src="/broke/logo.svg"
              alt="BROKE Logo"
              width={40}
              height={42}
              priority
            />
          </Link>
        </div>

        <ul className="broke-desktop-only">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={isActive(link.href) ? 'active' : ''}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <button
          className={`broke-hamburger broke-mobile-only ${mobileNavOpen ? 'open' : ''}`}
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          aria-label="Toggle menu"
        >
          <div className="lines">
            <div className="line" />
            <div className="line" />
          </div>
          <svg
            className="close"
            width="30"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </nav>

      <MobileNav
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        navLinks={navLinks}
        isActive={isActive}
      />
    </>
  );
}
