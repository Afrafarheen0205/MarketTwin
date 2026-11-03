import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    // Primary & State Colors
    colorPrimary: '#1677FF',
    colorInfo: '#1677FF',
    colorSuccess: '#52C41A',
    colorWarning: '#FAAD14',
    colorError: '#FF4D4F',

    // Typography & Contrast
    colorTextBase: '#172B4D',
    colorText: '#172B4D',
    colorTextSecondary: '#64748B',
    colorTextTertiary: '#8993A4',
    colorTextQuaternary: '#CBD5E1',

    // Backgrounds (Strict Light Theme)
    colorBgBase: '#FFFFFF',
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#F5F7FA',
    colorBgElevated: '#FFFFFF',
    colorBgSpotlight: '#172B4D',

    // Borders & Dividers
    colorBorder: '#E2E8F0',
    colorBorderSecondary: '#F1F5F9',

    // Radii & Metrics (Scaled for spacious desktop presence)
    borderRadius: 10,
    borderRadiusSM: 8,
    borderRadiusLG: 14,
    controlHeight: 42,
    controlHeightSM: 34,
    controlHeightLG: 48,

    // Typography (Scaled up for bold readability)
    fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 15,
    fontSizeHeading1: 36,
    fontSizeHeading2: 28,
    fontSizeHeading3: 22,
    fontSizeHeading4: 18,
    fontSizeHeading5: 15,

    // Shadows
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
    boxShadowSecondary: '0 4px 14px rgba(0, 0, 0, 0.08)',
    boxShadowTertiary: '0 10px 28px rgba(0, 0, 0, 0.12)',
  },
  components: {
    Layout: {
      headerBg: '#FFFFFF',
      headerPadding: '0 32px',
      siderBg: '#FFFFFF',
      bodyBg: '#F5F7FA',
      footerBg: '#FFFFFF',
      footerPadding: '20px 32px',
    },
    Menu: {
      itemBg: '#FFFFFF',
      itemColor: '#172B4D',
      itemSelectedColor: '#1677FF',
      itemSelectedBg: '#E6F4FF',
      itemHoverColor: '#1677FF',
      itemHoverBg: '#F8FAFC',
      itemBorderRadius: 10,
      itemMarginInline: 10,
      itemHeight: 46,
      fontSize: 14.5,
    },
    Card: {
      colorBgContainer: '#FFFFFF',
      colorBorderSecondary: '#E2E8F0',
      headerHeight: 56,
      headerFontSize: 17,
      padding: 24,
    },
    Button: {
      controlHeight: 42,
      borderRadius: 10,
      primaryShadow: '0 2px 0 rgba(22, 119, 255, 0.08)',
      defaultBorderColor: '#CBD5E1',
      defaultColor: '#172B4D',
      fontWeight: 600,
    },
    Table: {
      headerBg: '#F8FAFC',
      headerColor: '#475569',
      rowHoverBg: '#F8FAFC',
      borderColor: '#F1F5F9',
      borderRadius: 12,
      fontSize: 14.5,
    },
    Input: {
      controlHeight: 42,
      borderRadius: 10,
      activeBorderColor: '#1677FF',
      hoverBorderColor: '#4096FF',
      fontSize: 14.5,
    },
    Select: {
      controlHeight: 42,
      borderRadius: 10,
      fontSize: 14.5,
    },
    Tag: {
      borderRadiusSM: 6,
      fontSize: 12.5,
    },
    Modal: {
      headerBg: '#FFFFFF',
      contentBg: '#FFFFFF',
      borderRadiusLG: 16,
    },
    Drawer: {
      colorBgElevated: '#FFFFFF',
    },
    Tabs: {
      itemColor: '#64748B',
      itemSelectedColor: '#1677FF',
      itemHoverColor: '#1677FF',
      titleFontSize: 15,
    },
    Breadcrumb: {
      itemColor: '#64748B',
      lastItemColor: '#172B4D',
      separatorColor: '#CBD5E1',
      fontSize: 13.5,
    },
  },
};

export default themeConfig;
