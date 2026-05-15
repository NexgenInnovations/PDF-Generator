interface IsMobileOptions {
  featureDetect?: boolean;
  tablet?: boolean;
  ua?: string | { headers?: Record<string, string> };
}

const mobileRE =
  /(android|bb\d+|meego).+mobile|armv7l|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|redmi|series[46]0|samsungbrowser.*mobile|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i;
const notMobileRE = /CrOS/;
const tabletRE = /android|ipad|playbook|silk/i;

export function isMobile(opts: IsMobileOptions = {}) {
  let { ua } = opts;
  if (!ua && typeof navigator !== 'undefined') ua = navigator.userAgent;
  if (typeof ua === 'object' && typeof ua.headers?.['user-agent'] === 'string') {
    ua = ua.headers['user-agent'];
  }
  if (typeof ua !== 'string') return false;

  let result = (mobileRE.test(ua) && !notMobileRE.test(ua)) || (!!opts.tablet && tabletRE.test(ua));

  if (
    !result &&
    opts.tablet &&
    opts.featureDetect &&
    typeof navigator !== 'undefined' &&
    navigator.maxTouchPoints > 1 &&
    ua.includes('Macintosh') &&
    ua.includes('Safari')
  ) {
    result = true;
  }

  return result;
}

export default isMobile;
