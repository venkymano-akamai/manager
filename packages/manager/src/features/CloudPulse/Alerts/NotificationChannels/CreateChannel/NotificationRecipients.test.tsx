import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

import { accountUserFactory } from 'src/factories/accountUsers';
import { renderWithThemeAndHookFormContext } from 'src/utilities/testHelpers';

import { NotificationRecipients } from './NotificationRecipients';

const queryMocks = vi.hoisted(() => ({
  useAccountUsersInfiniteQuery: vi.fn().mockReturnValue({}),
}));

const flagsMocks = vi.hoisted(() => ({
  useFlags: vi.fn().mockReturnValue({}),
}));

vi.mock('@linode/queries', async () => {
  const actual = await vi.importActual('@linode/queries');
  return {
    ...actual,
    useAccountUsersInfiniteQuery: queryMocks.useAccountUsersInfiniteQuery,
  };
});

vi.mock('src/hooks/useFlags', async () => {
  const actual = await vi.importActual('src/hooks/useFlags');
  return {
    ...actual,
    useFlags: flagsMocks.useFlags,
  };
});

const SELECT_ALL = 'Select All';
const DESELECT_ALL = 'Deselect All';
const ARIA_SELECTED = 'aria-selected';

describe('NotificationRecipients component tests', () => {
  beforeEach(() => {
    // Default mock for flags
    flagsMocks.useFlags.mockReturnValue({
      aclpAlerting: {
        maxEmailRecipients: 10,
      },
    });
  });

  it('should render the component with empty state', () => {
    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: [] }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    expect(screen.getByTestId('recipients-select')).toBeVisible();
    expect(screen.getByPlaceholderText('Enter recipients')).toBeVisible();
    expect(screen.getByText('Select up to 10 Recipients')).toBeVisible();
  });

  it('should render loading state', () => {
    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: undefined,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isLoading: true,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    expect(screen.getByTestId('recipients-select')).toBeVisible();
  });

  it('should be able to select all recipients', async () => {
    const user = userEvent.setup();
    const mockUsers = accountUserFactory.buildList(2);

    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: mockUsers }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(await screen.findByRole('option', { name: SELECT_ALL }));

    expect(
      await screen.findByRole('option', {
        name: mockUsers[0].username,
      })
    ).toHaveAttribute(ARIA_SELECTED, 'true');
    expect(
      screen.getByRole('option', {
        name: mockUsers[1].username,
      })
    ).toHaveAttribute(ARIA_SELECTED, 'true');
  });

  it('should be able to deselect all selected recipients', async () => {
    const user = userEvent.setup();
    const mockUsers = accountUserFactory.buildList(2);

    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: mockUsers }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(await screen.findByRole('option', { name: SELECT_ALL }));
    await user.click(await screen.findByRole('option', { name: DESELECT_ALL }));

    expect(
      await screen.findByRole('option', {
        name: mockUsers[0].username,
      })
    ).toHaveAttribute(ARIA_SELECTED, 'false');
    expect(
      screen.getByRole('option', {
        name: mockUsers[1].username,
      })
    ).toHaveAttribute(ARIA_SELECTED, 'false');
  });

  it('should select multiple recipients individually', async () => {
    const user = userEvent.setup();
    const mockUsers = accountUserFactory.buildList(3);

    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: mockUsers }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(
      await screen.findByRole('option', { name: mockUsers[0].username })
    );
    await user.click(
      await screen.findByRole('option', { name: mockUsers[1].username })
    );

    expect(
      await screen.findByRole('option', {
        name: mockUsers[0].username,
      })
    ).toHaveAttribute(ARIA_SELECTED, 'true');
    expect(
      screen.getByRole('option', {
        name: mockUsers[1].username,
      })
    ).toHaveAttribute(ARIA_SELECTED, 'true');
    expect(
      screen.getByRole('option', {
        name: mockUsers[2].username,
      })
    ).toHaveAttribute(ARIA_SELECTED, 'false');
    expect(
      screen.getByRole('option', {
        name: SELECT_ALL,
      })
    ).toHaveAttribute(ARIA_SELECTED, 'false');
  });

  it('should disable Select All when search input is not empty', async () => {
    const user = userEvent.setup();
    const mockUsers = accountUserFactory.buildList(3);

    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: mockUsers }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    const input = screen.getByPlaceholderText('Enter recipients');
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.type(input, 'test');

    await waitFor(() => {
      const selectAllOption = screen.queryByRole('option', {
        name: SELECT_ALL,
      });
      expect(selectAllOption).not.toBeInTheDocument();
    });
  });

  it('should disable Select All when recipients exceed max limit', async () => {
    const user = userEvent.setup();
    const mockUsers = accountUserFactory.buildList(15);

    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: mockUsers }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    await user.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => {
      const selectAllOption = screen.queryByRole('option', {
        name: SELECT_ALL,
      });
      expect(selectAllOption).not.toBeInTheDocument();
    });
  });

  it('should disable unselected options when max selections reached', async () => {
    const user = userEvent.setup();
    const mockUsers = accountUserFactory.buildList(12);

    // Set max limit to 5 for this test
    flagsMocks.useFlags.mockReturnValue({
      aclpAlerting: {
        maxEmailRecipients: 5,
      },
    });

    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: mockUsers }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    await user.click(screen.getByRole('button', { name: 'Open' }));

    for (let i = 0; i < 5; i++) {
      await user.click(
        await screen.findByRole('option', { name: mockUsers[i].username })
      );
    }

    // Check that unselected options are disabled
    const unselectedOption = screen.getByRole('option', {
      name: mockUsers[5].username,
    });
    expect(unselectedOption).toHaveAttribute('aria-disabled', 'true');
  });

  it('should fetch next page on scroll to bottom', async () => {
    const user = userEvent.setup();
    const mockUsers = accountUserFactory.buildList(10);
    const fetchNextPage = vi.fn();

    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: mockUsers }] },
      fetchNextPage,
      hasNextPage: true,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    await user.click(screen.getByRole('button', { name: 'Open' }));

    const listbox = screen.getByRole('listbox');

    // Simulate scroll to bottom
    Object.defineProperty(listbox, 'scrollHeight', { value: 1000 });
    Object.defineProperty(listbox, 'clientHeight', { value: 100 });
    Object.defineProperty(listbox, 'scrollTop', { value: 900 });

    listbox.dispatchEvent(new Event('scroll', { bubbles: true }));

    await waitFor(() => {
      expect(fetchNextPage).toHaveBeenCalled();
    });
  });

  it('should not fetch next page when not at bottom', async () => {
    const user = userEvent.setup();
    const mockUsers = accountUserFactory.buildList(10);
    const fetchNextPage = vi.fn();

    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: mockUsers }] },
      fetchNextPage,
      hasNextPage: true,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    await user.click(screen.getByRole('button', { name: 'Open' }));

    const listbox = screen.getByRole('listbox');

    // Simulate scroll but not to bottom
    Object.defineProperty(listbox, 'scrollHeight', { value: 1000 });
    Object.defineProperty(listbox, 'clientHeight', { value: 100 });
    Object.defineProperty(listbox, 'scrollTop', { value: 400 });

    listbox.dispatchEvent(new Event('scroll', { bubbles: true }));

    await waitFor(() => {
      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });

  it('should use default max recipients limit when flag is not set', () => {
    flagsMocks.useFlags.mockReturnValue({});

    queryMocks.useAccountUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ data: [] }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isLoading: false,
    });

    renderWithThemeAndHookFormContext({
      component: <NotificationRecipients name="recipients" />,
    });

    expect(screen.getByText('Select up to 10 Recipients')).toBeVisible();
  });
});
