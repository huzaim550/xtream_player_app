/**
 * The single interactive primitive.
 *
 * Every tappable thing in this app goes through Focusable. Not a style
 * preference -- on a TV, a control that cannot take focus cannot be reached by
 * any sequence of D-pad presses, and one unreachable control makes the screen
 * look frozen. Routing everything through one component makes that structurally
 * hard to get wrong.
 *
 * Note the two Touchables that are banned outright: TouchableNativeFeedback and
 * TouchableWithoutFeedback emit no focus events on TV (per the react-native-tvos
 * README), so either one becomes an invisible hole in the focus map.
 */

import { forwardRef, useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import { IS_TV, Layout, Palette } from './platform';

export interface FocusableRenderState {
  focused: boolean;
  pressed: boolean;
}

export interface FocusableProps extends Omit<PressableProps, 'children' | 'style'> {
  children: React.ReactNode | ((state: FocusableRenderState) => React.ReactNode);
  /** Style for the pressable itself -- padding, background, borders. */
  style?: StyleProp<ViewStyle>;
  /**
   * Style for the outer wrapper (the one carrying the TV focus scale).
   *
   * Needed whenever this element gets its size from its *parent* rather than
   * from its children -- `position: absolute` fills and `flex: 1`. `style`
   * lands on the inner Pressable, whose parent is this wrapper; if the wrapper
   * is auto-sized, an absolutely positioned Pressable resolves against a
   * zero-height box and the control becomes untappable while still rendering.
   * Anything sized by its content (a poster, a button with a label) does not
   * need this.
   */
  containerStyle?: StyleProp<ViewStyle>;
  /** Draw the default focus ring and scale. Off for things that style
   *  themselves entirely, like a poster card with its own overlay. */
  showFocusRing?: boolean;
  /** Fired when this element gains focus. Parents use it to scroll the focused
   *  item into view -- the native focus engine does not do that reliably
   *  inside a virtualised list. */
  onFocusEnter?: () => void;
}

export const Focusable = forwardRef<View, FocusableProps>(function Focusable(
  {
    children,
    style,
    containerStyle,
    showFocusRing = true,
    onFocusEnter,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animate = useCallback(
    (to: number) => {
      if (!IS_TV) return;
      Animated.timing(scale, {
        toValue: to,
        duration: Layout.focusAnimationMs,
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  const handleFocus = useCallback(
    (e: Parameters<NonNullable<PressableProps['onFocus']>>[0]) => {
      setFocused(true);
      animate(Layout.focusScale);
      onFocusEnter?.();
      onFocus?.(e);
    },
    [animate, onFocus, onFocusEnter],
  );

  const handleBlur = useCallback(
    (e: Parameters<NonNullable<PressableProps['onBlur']>>[0]) => {
      setFocused(false);
      animate(1);
      onBlur?.(e);
    },
    [animate, onBlur],
  );

  return (
    <Animated.View
      style={[containerStyle, IS_TV ? { transform: [{ scale }] } : null]}
    >
      <Pressable
        ref={ref}
        onFocus={handleFocus}
        onBlur={handleBlur}
        // Ripple is a phone affordance; on a TV the focus ring does the work.
        android_ripple={IS_TV ? undefined : { color: 'rgba(255,255,255,0.12)' }}
        style={({ pressed }) => [
          showFocusRing && {
            borderWidth: Layout.focusRingWidth,
            borderColor: focused ? Palette.focus : 'transparent',
            borderRadius: Layout.radius,
          },
          // On a phone the press state is the feedback; on a TV a press is
          // over too fast to see, so focus carries it instead.
          !IS_TV && pressed ? { opacity: 0.7 } : null,
          style,
        ]}
        {...rest}
      >
        {({ pressed }: { pressed: boolean }) =>
          typeof children === 'function' ? children({ focused, pressed }) : children
        }
      </Pressable>
    </Animated.View>
  );
});
