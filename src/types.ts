/**
 * Public data model of Tickframe (architecture specification §6).
 *
 * Compiler invariants, enforced by the compiler and documented here:
 * `scenes[0].at === 0`, `at` strictly ascending; keys unique among siblings;
 * `tag` in the allowlist; reserved keys never written as attributes; every
 * animated attribute has both end values or an initial-value-table entry;
 * `Stage[]` sets unique, `at` integers >= 0, overlaps allowed, a missing set
 * means `'together'`; track keyframes ascending; `Infinity` only as `repeat`.
 *
 * Time-valued inputs accept `TimeInput` and are normalised to integer `Tick`
 * by the compiler; runtime structures hold only `Tick`.
 */

/** integer >= 0; 1 tick = 1/tickRate s [P1] */
export type Tick = number;
/** '600ms'; '12f' = 12 frames of program.fps (§7.2) */
export type TimeInput = Tick | `${number}ms` | `${number}f`;
/** An attribute value: a number or a string written verbatim. */
export type Value = number | string;
/** SVG attributes, kebab-case, written verbatim */
export type Attrs = Record<string, Value>;

/** An animation program: the viewBox, timing defaults and the ordered scenes. */
export interface Program {
  /** viewBox; 'auto' = host box (§5.5) */
  size: [w: number, h: number] | 'auto';
  /** default 1000 */
  tickRate?: number;
  /** default 60; frame grid, not a render cap */
  fps?: number;
  /** default max(finite t1, last scene at) */
  duration?: TimeInput;
  /** true = infinite; n = n passes */
  loop?: boolean | number;
  /** accessible-name fallback (§5.4) */
  title?: string;
  defaults?: Partial<Transition>;
  /** retarget duration D; 0 = instant (§7.7) */
  blend?: TimeInput;
  /** ascending at; scenes[0].at === 0 */
  scenes: Scene[];
  markers?: { at: TimeInput; name: string }[];
  /** default 'rgb' (§12.4 A-1) */
  colorSpace?: 'rgb' | 'oklab' | 'oklch';
}

/** A scene: the marks that exist from `at` onwards and the transition into it. */
export interface Scene {
  at: TimeInput;
  /** pure and deterministic (R12) */
  marks: Mark[] | ((ctx: Ctx) => Mark[]);
  /** into this scene */
  transition?: Partial<Transition>;
}

/** Timing and staging of the change from one scene into the next. */
export interface Transition {
  /** default 600 */
  duration: TimeInput;
  /** default 'ease-in-out' */
  ease: Ease;
  /** default 'together' */
  stages: 'together' | 'exit-update-enter' | Stage[];
  /** default {opacity: 0}: start values of entering marks */
  enter: Attrs;
  /** default {opacity: 0}: end values of leaving marks */
  exit: Attrs;
}

/** One explicitly timed set of a staged transition. */
export interface Stage {
  set: 'exit' | 'update' | 'enter';
  at: TimeInput;
  duration?: TimeInput;
  ease?: Ease;
}

/** The reserved keys of a mark; every other key of a `Mark` is an SVG attribute. */
export interface MarkReserved {
  /** unique among siblings; key path = ancestor keys joined by '/' */
  key: string;
  /** SVG element name from the allowlist (§12.4 A-9) */
  tag: string;
  /** textContent; a discrete track on attr 'text' */
  text?: string;
  children?: Mark[];
  /** shifts this mark's segments and presence start (stagger) */
  delay?: TimeInput;
  /** precedence mark ?? stage ?? transition */
  duration?: TimeInput;
  ease?: Ease;
  /** per-mark overrides */
  enter?: Attrs;
  /** per-mark overrides */
  exit?: Attrs;
  /** attr -> track; ticks relative to the scene's at */
  tracks?: Record<string, Track>;
  /** attr -> custom interpolator (kind 'custom') */
  interpolate?: Record<string, Interpolator>;
  /** <title> child; accessible name of the mark */
  label?: string;
  /** tabindex="0" and a drawn focus ring (§5.4) */
  focusable?: boolean;
  /** part attribute for ::part() */
  part?: string;
  /** never animated; written once at create */
  static?: boolean;
  /** carried into markpointer events; never rendered */
  datum?: unknown;
}

/** other keys are SVG attributes (Value) */
export type Mark = MarkReserved & { [attr: string]: unknown };

/** >= 2 keyframes; repeat may be Infinity */
export interface Track {
  keyframes: [at: TimeInput, value: Value, ease?: Ease][];
  repeat?: number;
  alternate?: boolean;
}

/** Builds the interpolation function between two attribute values. */
export type Interpolator = (from: Value, to: Value) => (p: number) => Value;

/** The CSS easing keywords accepted as an `Ease`. */
export type EaseKeyword = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step-start' | 'step-end';

/** Parameters of a spring easing. */
export interface Spring {
  stiffness?: number;
  damping?: number;
  mass?: number;
  visualDuration?: number;
  bounce?: number;
}

/** An easing: a keyword, a CSS easing function string, a spring or a progress function. */
export type Ease =
  | EaseKeyword
  | `cubic-bezier(${string})`
  | `linear(${string})`
  | `steps(${string})`
  | { spring: Spring }
  | ((p: number) => number);

/** Compile-time context passed to scene mark functions. */
export interface Ctx {
  data: unknown;
  state: unknown;
  /** from size, or the host box when size === 'auto' */
  width: number;
  /** from size, or the host box when size === 'auto' */
  height: number;
  /** memoised; compile-time only */
  measure(text: string, attrs?: Attrs): { width: number; height: number };
}

/** Index of a compiled mark in `Compiled.marks`. */
export type MarkId = number;
/** The interpolation kind of a segment. */
export type Kind = 'number' | 'numbers' | 'color' | 'path' | 'transform' | 'discrete' | 'custom';

/** One interpolated span of one attribute of one mark. */
export interface Segment {
  markId: MarkId;
  attr: string;
  /** t1 > t0; a jump is a 1-tick 'discrete' segment */
  t0: Tick;
  /** t1 > t0; a jump is a 1-tick 'discrete' segment */
  t1: Tick;
  from: Value;
  to: Value;
  ease: (p: number) => number;
  kind: Kind;
  /** repeat >= 1, Infinity allowed; one iteration L = t1 - t0 */
  repeat: number;
  /** repeat >= 1, Infinity allowed; one iteration L = t1 - t0 */
  alternate: boolean;
  /** interpolator, built lazily and cached (§7.4) */
  fn?: (p: number) => Value;
  /** track-derived segments: track period and start (§7.3) */
  period?: Tick;
  /** track-derived segments: track period and start (§7.3) */
  start?: Tick;
}

/** The index range of one (mark, attr) run in `Compiled.segments` and its evaluation cursor. */
export interface Run {
  markId: MarkId;
  attr: string;
  first: number;
  last: number;
  cursor: number;
}

/** A mark after compilation: identity, tree position, presence and static attributes. */
export interface CompiledMark {
  markId: MarkId;
  key: string;
  path: string;
  tag: string;
  parent: MarkId | -1;
  /** closed-open interval; backward scrub re-enters */
  presence: [enter: Tick, exitEnd: Tick];
  /** sibling order per scene, parallel to sceneAts; -1 = absent */
  orderBy: number[];
  staticAttrs: Attrs;
  label?: string;
  focusable?: boolean;
  part?: string;
}

/** The compiled program: everything evaluate needs, in ticks. */
export interface Compiled {
  tickRate: number;
  fps: number;
  duration: Tick;
  loop: boolean | number;
  markers: { at: Tick; name: string }[];
  marks: CompiledMark[];
  /** sorted by (markId, attr, t0) */
  segments: Segment[];
  index: Run[];
  sceneAts: Tick[];
}

/** The evaluated state at tick T: the tree of visible marks. */
export interface Frame {
  T: Tick;
  roots: MarkNode[];
}

/** One evaluated mark of a frame. */
export interface MarkNode {
  markId: MarkId;
  key: string;
  tag: string;
  attrs: Attrs;
  text?: string;
  children?: MarkNode[];
}

/** retarget state for evaluate (§7.7) */
export interface Blend {
  Tc: Tick;
  D: Tick;
  ease: (p: number) => number;
  /** per attr, per numeric channel */
  offsets: Map<MarkId, Record<string, { x0: number[]; v0: number[]; t1: Tick }>>;
  /** snapshot-only marks, faded with default exit */
  ghosts: Map<MarkId, MarkNode>;
}

/** Produces the integer tick sequence and drives frame callbacks. */
export interface Clock {
  readonly T: Tick;
  readonly playing: boolean;
  /** rate < 0 reverses; 0 holds */
  rate: number;
  play(): void;
  pause(): void;
  seek(T: Tick, o?: { events?: boolean }): void;
  step(n?: number): void;
  /** once per rAF */
  onFrame(cb: (T: Tick, prevT: Tick) => void): () => void;
  dispose(): void;
}

/** How the clock advances T. */
export type ClockMode = 'raf' | 'follow' | 'external' | 'shared';

/** §7.1.2 */
export interface FollowOptions {
  /** range element; default the host */
  source?: Element;
  /** default 'cover 0% cover 100%'; scroll-driven-animations vocabulary */
  range?: string;
  root?: Element | Document;
  axis?: 'block' | 'inline' | 'x' | 'y';
  /** ms; default 120; 0 under reduced motion */
  tau?: number;
  /** max |dT| per frame; default Infinity */
  maxCatchUp?: Tick;
  /** default 1 */
  order?: 1 | 2;
}

/** seconds; T = floor(read() * tickRate) (§7.1.3) */
export interface ExternalClockOptions {
  read: () => number;
}

/** src inlined as data: URI */
export interface FontSpec {
  family: string;
  src: string;
  weight?: string;
  style?: string;
}

/** Options of the SVG export. */
export interface SvgOptions {
  scale?: number;
  fonts?: FontSpec[];
  inlineTheme?: boolean;
}

/** Options of the raster image export. */
export interface PngOptions {
  T?: Tick;
  scale?: number;
  type?: 'image/png' | 'image/jpeg' | 'image/webp';
}

/** Options of the video export. */
export interface VideoOptions {
  fps?: number;
  from?: Tick;
  to?: Tick;
  codec?: 'avc' | 'vp9' | 'av1' | 'hevc';
  bitrate?: number;
  width?: number;
  height?: number;
  format?: 'mp4' | 'webm';
  /** K-6 */
  audio?: AudioBuffer | HTMLMediaElement;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Options of the GIF export. */
export interface GifOptions {
  fps?: number;
  from?: Tick;
  to?: Tick;
  scale?: number;
  maxColors?: number;
  onProgress?: VideoOptions['onProgress'];
  signal?: AbortSignal;
}

/** §7.9.5; default 'visible' */
export interface BakeOptions {
  target?: 'smil' | 'css';
  sampleFps?: number;
  precision?: number;
  attribution?: 'visible' | 'comment' | false;
}

/** §5.3 */
export interface MarkPointerDetail {
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerover' | 'pointerout' | 'pointercancel' | 'click';
  key: string;
  path: string;
  datum: unknown;
  /** x, y in viewBox units */
  x: number;
  /** x, y in viewBox units */
  y: number;
  pointerId: number;
  originalEvent: PointerEvent | MouseEvent;
}
