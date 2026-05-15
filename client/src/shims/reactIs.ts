const REACT_ELEMENT_TYPE = Symbol.for('react.element');
const REACT_PORTAL_TYPE = Symbol.for('react.portal');
const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
const REACT_PROFILER_TYPE = Symbol.for('react.profiler');
const REACT_PROVIDER_TYPE = Symbol.for('react.provider');
const REACT_CONTEXT_TYPE = Symbol.for('react.context');
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
const REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
const REACT_MEMO_TYPE = Symbol.for('react.memo');
const REACT_LAZY_TYPE = Symbol.for('react.lazy');

export const ContextConsumer = REACT_CONTEXT_TYPE;
export const ContextProvider = REACT_PROVIDER_TYPE;
export const Element = REACT_ELEMENT_TYPE;
export const ForwardRef = REACT_FORWARD_REF_TYPE;
export const Fragment = REACT_FRAGMENT_TYPE;
export const Lazy = REACT_LAZY_TYPE;
export const Memo = REACT_MEMO_TYPE;
export const Portal = REACT_PORTAL_TYPE;
export const Profiler = REACT_PROFILER_TYPE;
export const StrictMode = REACT_STRICT_MODE_TYPE;
export const Suspense = REACT_SUSPENSE_TYPE;
export const SuspenseList = REACT_SUSPENSE_LIST_TYPE;

export function typeOf(object: unknown) {
  if (typeof object !== 'object' || object === null) return undefined;

  const element = object as { $$typeof?: symbol; type?: { $$typeof?: symbol } | symbol };
  switch (element.$$typeof) {
    case REACT_ELEMENT_TYPE: {
      const type = element.type;
      if (
        type === REACT_FRAGMENT_TYPE ||
        type === REACT_PROFILER_TYPE ||
        type === REACT_STRICT_MODE_TYPE ||
        type === REACT_SUSPENSE_TYPE ||
        type === REACT_SUSPENSE_LIST_TYPE
      ) {
        return type;
      }

      const typeTag = typeof type === 'object' && type !== null ? type.$$typeof : undefined;
      if (
        typeTag === REACT_CONTEXT_TYPE ||
        typeTag === REACT_FORWARD_REF_TYPE ||
        typeTag === REACT_LAZY_TYPE ||
        typeTag === REACT_MEMO_TYPE ||
        typeTag === REACT_PROVIDER_TYPE
      ) {
        return typeTag;
      }

      return element.$$typeof;
    }
    case REACT_PORTAL_TYPE:
      return element.$$typeof;
    default:
      return undefined;
  }
}

export function isValidElementType(type: unknown) {
  return (
    typeof type === 'string' ||
    typeof type === 'function' ||
    type === REACT_FRAGMENT_TYPE ||
    type === REACT_PROFILER_TYPE ||
    type === REACT_STRICT_MODE_TYPE ||
    type === REACT_SUSPENSE_TYPE ||
    type === REACT_SUSPENSE_LIST_TYPE ||
    (typeof type === 'object' &&
      type !== null &&
      'getModuleId' in type) ||
    (typeof type === 'object' &&
      type !== null &&
      '$$typeof' in type &&
      [
        REACT_CONTEXT_TYPE,
        REACT_FORWARD_REF_TYPE,
        REACT_LAZY_TYPE,
        REACT_MEMO_TYPE,
        REACT_PROVIDER_TYPE,
      ].includes((type as { $$typeof?: symbol }).$$typeof as symbol))
  );
}

export const isAsyncMode = () => false;
export const isConcurrentMode = () => false;
export const isContextConsumer = (object: unknown) => typeOf(object) === REACT_CONTEXT_TYPE;
export const isContextProvider = (object: unknown) => typeOf(object) === REACT_PROVIDER_TYPE;
export const isElement = (object: unknown) =>
  typeof object === 'object' &&
  object !== null &&
  (object as { $$typeof?: symbol }).$$typeof === REACT_ELEMENT_TYPE;
export const isForwardRef = (object: unknown) => typeOf(object) === REACT_FORWARD_REF_TYPE;
export const isFragment = (object: unknown) => typeOf(object) === REACT_FRAGMENT_TYPE;
export const isLazy = (object: unknown) => typeOf(object) === REACT_LAZY_TYPE;
export const isMemo = (object: unknown) => typeOf(object) === REACT_MEMO_TYPE;
export const isPortal = (object: unknown) => typeOf(object) === REACT_PORTAL_TYPE;
export const isProfiler = (object: unknown) => typeOf(object) === REACT_PROFILER_TYPE;
export const isStrictMode = (object: unknown) => typeOf(object) === REACT_STRICT_MODE_TYPE;
export const isSuspense = (object: unknown) => typeOf(object) === REACT_SUSPENSE_TYPE;
export const isSuspenseList = (object: unknown) => typeOf(object) === REACT_SUSPENSE_LIST_TYPE;

export default {
  ContextConsumer,
  ContextProvider,
  Element,
  ForwardRef,
  Fragment,
  Lazy,
  Memo,
  Portal,
  Profiler,
  StrictMode,
  Suspense,
  SuspenseList,
  isAsyncMode,
  isConcurrentMode,
  isContextConsumer,
  isContextProvider,
  isElement,
  isForwardRef,
  isFragment,
  isLazy,
  isMemo,
  isPortal,
  isProfiler,
  isStrictMode,
  isSuspense,
  isSuspenseList,
  isValidElementType,
  typeOf,
};
