import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

// Narrow contexts (an edgeless embed block) cannot fit the player at full
// size, and clipping hides the play button entirely. Declaring a query
// container lets the parts below scale themselves down instead, so everything
// stays visible — just smaller.
export const PLAYER_CONTAINER = 'audioPlayer';
const NARROW = `${PLAYER_CONTAINER} (max-width: 360px)`;

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 6,
  padding: 12,
  cursor: 'default',
  width: '100%',
  backgroundColor: cssVarV2('layer/background/primary'),
  gap: 12,
  containerType: 'inline-size',
  containerName: PLAYER_CONTAINER,
});

export const upper = style({
  display: 'flex',
  alignItems: 'flex-start',
  fontWeight: 500,
  fontSize: '16px',
  color: cssVarV2('text/primary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: '24px',
  gap: 12,
  // In an edgeless embed block the player is laid out at a narrow logical
  // width, where the control group cannot fit beside the title. Without
  // wrapping, `overflow: hidden` silently clips the play button off the right
  // edge. Wrapping degrades to a second row instead of hiding the control.
  flexWrap: 'wrap',
  rowGap: 8,
  '@container': {
    [NARROW]: {
      fontSize: '13px',
      lineHeight: '18px',
      gap: 6,
      rowGap: 6,
    },
  },
});

export const upperLeft = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  flex: 1,
  overflow: 'hidden',
  // A flex item's `min-width: auto` floors it at its content width; without
  // this the title refuses to give up space and pushes the controls out.
  minWidth: 0,
});

export const upperRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  '@container': {
    [NARROW]: {
      gap: 4,
    },
  },
  // upperLeft is `flex: 1`, so without this the right-hand control group is a
  // shrink candidate and collapses in narrow containers (e.g. an edgeless
  // embed block), clipping the play button out of view.
  flexShrink: 0,
});

export const upperRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const nameLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginRight: 8,
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
});

export const spacer = style({
  flex: 1,
});

export const description = style({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const audioIcon = style({
  height: 40,
  width: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const controlButton = style({
  height: 40,
  width: 40,
  // The fixed height/width above are not honoured under flex shrink pressure,
  // so the button squishes to a sliver in narrow containers without this.
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  // Play is the primary affordance of the player, so it uses the accent
  // background rather than the low-contrast secondary surface it had before.
  // Both tokens are theme-aware and resolve correctly in light and dark.
  backgroundColor: cssVarV2('button/primary'),
  color: cssVarV2('button/pureWhiteText'),
  '@container': {
    [NARROW]: {
      height: 28,
      width: 28,
    },
  },
});

export const controls = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 8,
});

export const button = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
  color: cssVarV2('text/primary'),
  border: 'none',
  borderRadius: 4,
  padding: '4px',
  minWidth: '28px',
  height: '28px',
  fontSize: '14px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: cssVarV2('layer/background/secondary'),
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const progressContainer = style({
  width: '100%',
  height: 32,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
});

export const progressBar = style({
  width: '100%',
  height: 12,
  backgroundColor: cssVarV2('layer/background/tertiary'),
  borderRadius: 2,
  overflow: 'hidden',
  cursor: 'pointer',
  position: 'relative',
});

export const progressFill = style({
  height: '100%',
  backgroundColor: cssVarV2('icon/fileIconColors/red'),
  transition: 'width 0.1s linear',
});

export const timeDisplay = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  minWidth: 48,
  ':last-of-type': {
    textAlign: 'right',
  },
});

export const playbackRateDisplay = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  cursor: 'pointer',
});

export const miniRoot = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 4,
  padding: 8,
  cursor: 'default',
  width: '100%',
  backgroundColor: cssVarV2('layer/background/primary'),
});

export const miniNameLabel = style({
  fontSize: cssVar('fontXs'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: '20px',
  marginBottom: 2,
});

export const miniPlayerContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 24,
});

export const miniProgressContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 24,
});

export const miniCloseButton = style({
  position: 'absolute',
  right: 8,
  top: 8,
  display: 'none',
  background: cssVarV2('layer/background/secondary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  selectors: {
    [`${miniRoot}:hover &`]: {
      display: 'block',
    },
  },
});
