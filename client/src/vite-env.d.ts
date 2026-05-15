/// <reference types="vite/client" />

declare module 'use-sync-external-store/shim/with-selector.js' {
  export function useSyncExternalStoreWithSelector<TSnapshot, TSelection>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => TSnapshot,
    getServerSnapshot: undefined | null | (() => TSnapshot),
    selector: (snapshot: TSnapshot) => TSelection,
    isEqual?: (a: TSelection, b: TSelection) => boolean
  ): TSelection;
}

declare module 'lodash-es/debounce.js' {
  export { default } from 'lodash-es';
}

declare module 'lodash-es/isPlainObject.js' {
  export { default } from 'lodash-es';
}

declare module 'lodash-es/throttle.js' {
  export { default } from 'lodash-es';
}
