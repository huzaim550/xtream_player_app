/**
 * TVFocusGuideView on TV, a plain View everywhere else.
 *
 * `autoFocus` is the reason this component earns its keep: it gives each region
 * free focus memory. First visit lands on the first child; every visit after
 * restores whatever was focused last. That is what makes "back out of a movie
 * and land on the card you came from" work with no bookkeeping at all.
 *
 * Be sparing with the trapFocus* props. Trapping is how a screen gets bricked --
 * only trap where escaping would be wrong, such as a modal.
 */

import { View, type ViewProps } from 'react-native';
import { IS_TV } from './platform';

// The fork adds TVFocusGuideView to react-native; the types are not always
// exported cleanly, so resolve it dynamically and fall back to View.
const RN = require('react-native') as Record<string, unknown>;
const TVFocusGuideView = (RN.TVFocusGuideView ?? View) as React.ComponentType<
  ViewProps & {
    autoFocus?: boolean;
    trapFocusUp?: boolean;
    trapFocusDown?: boolean;
    trapFocusLeft?: boolean;
    trapFocusRight?: boolean;
    destinations?: unknown[];
  }
>;

export interface FocusSectionProps extends ViewProps {
  /** Remember and restore the last focused child in this region. */
  autoFocus?: boolean;
  trapFocusUp?: boolean;
  trapFocusDown?: boolean;
  trapFocusLeft?: boolean;
  trapFocusRight?: boolean;
  /** Explicit focus targets, for the cases autoFocus cannot express -- e.g.
   *  "pressing Down from anywhere in the player lands on the transport bar". */
  destinations?: unknown[];
  children?: React.ReactNode;
}

export function FocusSection({ children, ...props }: FocusSectionProps) {
  if (!IS_TV) {
    // Strip the TV-only props so they never reach a plain View.
    const {
      autoFocus: _a,
      trapFocusUp: _u,
      trapFocusDown: _d,
      trapFocusLeft: _l,
      trapFocusRight: _r,
      destinations: _dest,
      ...viewProps
    } = props;
    return <View {...viewProps}>{children}</View>;
  }
  return <TVFocusGuideView {...props}>{children}</TVFocusGuideView>;
}
