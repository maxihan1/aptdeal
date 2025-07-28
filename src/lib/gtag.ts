export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', GA_TRACKING_ID!, {
      page_location: url,
    });
  }
};

// https://developers.google.com/analytics/devguides/collection/gtagjs/events
export const event = ({ action, category, label, value }: {
  action: string;
  category: string;
  label?: string;
  value?: number;
}) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};

// 사용자 정의 이벤트 추적
export const trackSearch = (sido: string, sigungu: string, dong?: string) => {
  event({
    action: 'search',
    category: 'engagement',
    label: `${sido} ${sigungu} ${dong || ''}`.trim(),
  });
};

export const trackAptDetail = (aptName: string) => {
  event({
    action: 'view_apt_detail',
    category: 'engagement',
    label: aptName,
  });
};

export const trackFavoriteRegion = (region: string) => {
  event({
    action: 'add_favorite_region',
    category: 'engagement',
    label: region,
  });
}; 