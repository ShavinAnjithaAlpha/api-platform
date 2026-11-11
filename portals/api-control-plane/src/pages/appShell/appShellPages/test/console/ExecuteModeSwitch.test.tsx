/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '@/test/utils';
import { executeModeSwitchPlugin } from './ExecuteModeSwitch';
import { createCallModeStore } from './utils/callModeStore';

/** Stands in for swagger's own Execute button. */
const Execute = () => (
  <button className="btn execute opblock-control__btn" type="button">
    Execute
  </button>
);

/** Renders what swagger would render for the wrapped `execute` component. */
const renderWrapped = (store = createCallModeStore('proxy')) => {
  const plugin = executeModeSwitchPlugin(store)();
  const wrap = plugin.wrapComponents.execute as (
    Original: typeof Execute,
  ) => (props: Record<string, unknown>) => ReactElement;
  const Wrapped = wrap(Execute);
  return { store, ...renderWithProviders(<Wrapped />) };
};

describe('ExecuteModeSwitch — placement', () => {
  it('leaves Execute a sibling of the switch, not a child of it', () => {
    // Swagger renders Execute and Clear into one container and styles them as
    // a joined pair. Wrapping Execute in an element takes it out of that
    // container, and Clear then lays out against the wrapper instead — which
    // is what scrambled the row once a response appeared.
    const { container } = renderWrapped();

    const modeRow = container.querySelector('.test-console-mode-row');
    const execute = container.querySelector('.btn.execute');

    expect(modeRow).not.toBeNull();
    expect(execute).not.toBeNull();
    expect(modeRow?.contains(execute as Node)).toBe(false);
    expect(execute?.parentElement).toBe(modeRow?.parentElement);
  });

  it('puts the switch before Execute, so it reads above it', () => {
    const { container } = renderWrapped();
    // The wrapper is a fragment, so both land directly in the container.
    const children = Array.from(container.children);

    expect(children[0]).toHaveClass('test-console-mode-row');
    expect(children[1]).toHaveClass('execute');
  });
});

describe('ExecuteModeSwitch — behaviour', () => {
  it('shows the mode the store holds', () => {
    renderWrapped(createCallModeStore('direct'));

    expect(screen.getByRole('button', { name: /^Direct$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('asks the page to change mode rather than changing it itself', async () => {
    // The page owns the value and persists it; the switch only requests.
    const store = createCallModeStore('proxy');
    const handler = vi.fn();
    store.setRequestHandler(handler);

    const { user } = renderWrapped(store);
    await user.click(screen.getByRole('button', { name: /^Direct$/i }));

    expect(handler).toHaveBeenCalledWith('direct');
  });

  it('repaints when the page publishes a new mode', async () => {
    // Swagger keeps the first `plugins` value it is given, so this component
    // can never be handed a newer prop — the subscription is the only way it
    // learns the mode changed.
    const store = createCallModeStore('proxy');
    renderWrapped(store);

    expect(screen.getByRole('button', { name: /Through proxy/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await vi.waitFor(() => {
      store.setMode('direct');
      expect(screen.getByRole('button', { name: /^Direct$/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });
});

describe('ExecuteModeSwitch — when only one mode can work', () => {
  it('renders no switch, and no empty row, while the store forbids switching', () => {
    // A self-hosted gateway is unreachable from the relay, so only Direct can
    // work; offering "Through proxy" would just produce a failed request.
    const { container } = renderWrapped(createCallModeStore('direct', false));

    expect(container.querySelector('.test-console-mode-row')).toBeNull();
    expect(screen.queryByRole('button', { name: /Through proxy/i })).toBeNull();
    // Execute itself is untouched.
    expect(container.querySelector('.btn.execute')).not.toBeNull();
  });

  it('shows and hides the switch as the page changes gateway', async () => {
    // Swagger keeps the first `plugins` value, so the row has to follow the
    // store rather than a prop when the user picks another gateway.
    const store = createCallModeStore('proxy', true);
    const { container } = renderWrapped(store);
    expect(container.querySelector('.test-console-mode-row')).not.toBeNull();

    await vi.waitFor(() => {
      store.setCanSwitch(false);
      expect(container.querySelector('.test-console-mode-row')).toBeNull();
    });

    await vi.waitFor(() => {
      store.setCanSwitch(true);
      expect(screen.getByRole('button', { name: /Through proxy/i })).toBeInTheDocument();
    });
  });
});
