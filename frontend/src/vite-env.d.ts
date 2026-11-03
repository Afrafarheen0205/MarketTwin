/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'lucide-react' {
  import * as React from 'react';
  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
    color?: string;
  }
  export type LucideIcon = React.ForwardRefExoticComponent<
    LucideProps & React.RefAttributes<SVGSVGElement>
  >;

  export const Activity: LucideIcon;
  export const Boxes: LucideIcon;
  export const ClipboardList: LucideIcon;
  export const UserCheck: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const BarChart3: LucideIcon;
  export const Bell: LucideIcon;
  export const Gavel: LucideIcon;
  export const Globe: LucideIcon;
  export const Lock: LucideIcon;
  export const Package: LucideIcon;
  export const TrendingUp: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const Code2: LucideIcon;
  export const Cpu: LucideIcon;
  export const Database: LucideIcon;
  export const Heart: LucideIcon;
  export const HelpCircle: LucideIcon;
  export const Layers: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Search: LucideIcon;
  export const Server: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const ShoppingCart: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Store: LucideIcon;
  export const User: LucideIcon;
  export const Users: LucideIcon;
  export const XCircle: LucideIcon;
  export const Zap: LucideIcon;
}
