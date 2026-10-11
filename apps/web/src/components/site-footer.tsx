import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50/80">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
        <div>
          <p className="text-lg font-semibold text-slate-900">
            Vedaa <span className="text-brand">Mart</span>
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Scheduled grocery delivery across Chhatarpur with fixed daily slots. Fresh products, transparent pricing.
          </p>
        </div>
        <div>
          <p className="font-medium text-slate-900">Shop</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            <li>
              <Link href="/categories/fresh-fruits" className="transition hover:text-brand">
                Categories
              </Link>
            </li>
            <li>
              <Link href="/search" className="transition hover:text-brand">
                Search
              </Link>
            </li>
            <li>
              <Link href="/cart" className="transition hover:text-brand">
                Cart
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-900">Support</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            <li>help@vedaamart.com</li>
            <li>+91 80 4567 8900</li>
            <li>Mon–Sun · 8:00 AM – 9:00 PM IST</li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-900">Policies</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            <li>Privacy Policy</li>
            <li>Terms of Service</li>
            <li>Cancellation Policy</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Vedaa Mart. All rights reserved.
      </div>
    </footer>
  );
}
