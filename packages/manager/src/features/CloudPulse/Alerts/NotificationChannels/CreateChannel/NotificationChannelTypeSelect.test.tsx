import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

import { renderWithThemeAndHookFormContext } from 'src/utilities/testHelpers';

import { NotificationChannelTypeSelect } from './NotificationChannelTypeSelect';

const mockHandleChannelTypeChange = vi.fn();

describe('NotificationChannelTypeSelect component tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the Autocomplete component', () => {
    renderWithThemeAndHookFormContext({
      component: (
        <NotificationChannelTypeSelect
          handleChannelTypeChange={mockHandleChannelTypeChange}
          name="type"
        />
      ),
    });
    expect(screen.getByTestId('channel-type-select')).toBeVisible();
    expect(screen.getByText('Type')).toBeVisible();
    expect(screen.getByPlaceholderText('Select a Channel Type')).toBeVisible();
  });

  it('should render channel type options when opened and able to select an option', async () => {
    renderWithThemeAndHookFormContext({
      component: (
        <NotificationChannelTypeSelect
          handleChannelTypeChange={mockHandleChannelTypeChange}
          name="type"
        />
      ),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('option', { name: 'Email' })).toBeVisible();
    // select the email option and verify the value is set
    await userEvent.click(await screen.findByRole('option', { name: 'Email' }));
    expect(screen.getByRole('combobox')).toHaveAttribute('value', 'Email');
    // verify handleChannelTypeChange is called
    expect(mockHandleChannelTypeChange).toHaveBeenCalled();
  });

  it('should be able to clear the selected channel type', async () => {
    renderWithThemeAndHookFormContext({
      component: (
        <NotificationChannelTypeSelect
          handleChannelTypeChange={mockHandleChannelTypeChange}
          name="type"
        />
      ),
      useFormOptions: {
        defaultValues: {
          type: 'email',
        },
      },
    });

    // Verify initial value is set
    expect(screen.getByRole('combobox')).toHaveAttribute('value', 'Email');

    // Click the clear button
    const clearButton = screen.getByLabelText('Clear');
    await userEvent.click(clearButton);

    // verify the value is cleared and handleChannelTypeChange is called
    expect(screen.getByRole('combobox')).toHaveAttribute('value', '');
    expect(mockHandleChannelTypeChange).toHaveBeenCalled();
  });

  it('should display error message when field has validation error', () => {
    const errorMessage = 'Channel type is required';

    renderWithThemeAndHookFormContext({
      component: (
        <NotificationChannelTypeSelect
          handleChannelTypeChange={mockHandleChannelTypeChange}
          name="type"
        />
      ),
      useFormOptions: {
        defaultValues: {
          type: null,
        },
        errors: {
          type: {
            message: errorMessage,
            type: 'required',
          },
        },
      },
    });

    screen.getByText(errorMessage);
  });
});
