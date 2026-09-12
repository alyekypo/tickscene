import { expectTypeOf, test } from 'vitest';
import type {
  Blend,
  Clock,
  Compiled,
  Ease,
  EaseKeyword,
  Mark,
  MarkId,
  MarkPointerDetail,
  Program,
  Scene,
  Segment,
  Tick,
  TimeInput,
  Value,
} from '../../src/index';

test('TimeInput accepts ticks and unit strings and rejects unitless strings', () => {
  expectTypeOf<600>().toExtend<TimeInput>();
  expectTypeOf<'600ms'>().toExtend<TimeInput>();
  expectTypeOf<'12f'>().toExtend<TimeInput>();
  // @ts-expect-error a bare digit string carries no unit
  const unitless: TimeInput = '600';
  void unitless;
});

test('Ease accepts every keyword, cubic-bezier strings, springs and functions', () => {
  expectTypeOf<'linear'>().toExtend<Ease>();
  expectTypeOf<'ease'>().toExtend<Ease>();
  expectTypeOf<'ease-in'>().toExtend<Ease>();
  expectTypeOf<'ease-out'>().toExtend<Ease>();
  expectTypeOf<'ease-in-out'>().toExtend<Ease>();
  expectTypeOf<'step-start'>().toExtend<Ease>();
  expectTypeOf<'step-end'>().toExtend<Ease>();
  expectTypeOf<EaseKeyword>().toEqualTypeOf<
    'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step-start' | 'step-end'
  >();
  expectTypeOf<`cubic-bezier(${string})`>().toExtend<Ease>();
  const spring: Ease = { spring: {} };
  void spring;
  expectTypeOf<(p: number) => number>().toExtend<Ease>();
});

test('Mark accepts reserved keys beside arbitrary SVG attributes', () => {
  const mark: Mark = { key: 'a', tag: 'rect', x: 1, fill: 'red' };
  void mark;
});

test('Program requires size and scenes', () => {
  expectTypeOf<Program>().toHaveProperty('size');
  expectTypeOf<Program>().toHaveProperty('scenes');
  // @ts-expect-error size is required
  const noSize: Program = { scenes: [] as Scene[] };
  void noSize;
});

test('compiled form', () => {
  expectTypeOf<Pick<Segment, 'fn'>>().toEqualTypeOf<{ fn?: (p: number) => Value }>();
  expectTypeOf<Compiled['segments']>().toEqualTypeOf<Segment[]>();
  expectTypeOf<Blend['offsets']>().toEqualTypeOf<
    Map<MarkId, Record<string, { x0: number[]; v0: number[]; t1: Tick }>>
  >();
});

test('clock and element contracts', () => {
  expectTypeOf<ReturnType<Clock['onFrame']>>().toEqualTypeOf<() => void>();
  expectTypeOf<MarkPointerDetail['type']>().toEqualTypeOf<
    'pointerdown' | 'pointermove' | 'pointerup' | 'pointerover' | 'pointerout' | 'pointercancel' | 'click'
  >();
});
