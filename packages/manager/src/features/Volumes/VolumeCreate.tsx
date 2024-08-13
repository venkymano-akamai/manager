import { CreateVolumeSchema } from '@linode/validation/lib/volumes.schema';
import { useTheme } from '@mui/material/styles';
import { useFormik } from 'formik';
import { useSnackbar } from 'notistack';
import * as React from 'react';
import { useHistory } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';

import { Box } from 'src/components/Box';
import { Button } from 'src/components/Button/Button';
import { DocumentTitleSegment } from 'src/components/DocumentTitle';
import {
  BLOCK_STORAGE_CHOOSE_REGION_COPY,
  BLOCK_STORAGE_ENCRYPTION_GENERAL_DESCRIPTION,
  BLOCK_STORAGE_ENCRYPTION_OVERHEAD_CAVEAT,
  BLOCK_STORAGE_ENCRYPTION_UNAVAILABLE_IN_REGION_COPY,
  BLOCK_STORAGE_USER_SIDE_ENCRYPTION_CAVEAT,
} from 'src/components/Encryption/constants';
import { Encryption } from 'src/components/Encryption/Encryption';
import { useIsBlockStorageEncryptionFeatureEnabled } from 'src/components/Encryption/utils';
import { ErrorMessage } from 'src/components/ErrorMessage';
import { LandingHeader } from 'src/components/LandingHeader';
import { Notice } from 'src/components/Notice/Notice';
import { Paper } from 'src/components/Paper';
import { RegionSelect } from 'src/components/RegionSelect/RegionSelect';
import { TextField } from 'src/components/TextField';
import { TooltipIcon } from 'src/components/TooltipIcon';
import { Typography } from 'src/components/Typography';
import { MAX_VOLUME_SIZE } from 'src/constants';
import { EUAgreementCheckbox } from 'src/features/Account/Agreements/EUAgreementCheckbox';
import { getRestrictedResourceText } from 'src/features/Account/utils';
import { LinodeSelect } from 'src/features/Linodes/LinodeSelect/LinodeSelect';
import {
  reportAgreementSigningError,
  useAccountAgreements,
  useMutateAccountAgreements,
} from 'src/queries/account/agreements';
import { useGrants, useProfile } from 'src/queries/profile/profile';
import { useRegionsQuery } from 'src/queries/regions/regions';
import {
  useCreateVolumeMutation,
  useVolumeTypesQuery,
} from 'src/queries/volumes/volumes';
import { sendCreateVolumeEvent } from 'src/utilities/analytics/customEventAnalytics';
import { doesRegionSupportFeature } from 'src/utilities/doesRegionSupportFeature';
import { getGDPRDetails } from 'src/utilities/formatRegion';
import {
  handleFieldErrors,
  handleGeneralErrors,
} from 'src/utilities/formikErrorUtils';
import { isNilOrEmpty } from 'src/utilities/isNilOrEmpty';
import { maybeCastToNumber } from 'src/utilities/maybeCastToNumber';
import { PRICES_RELOAD_ERROR_NOTICE_TEXT } from 'src/utilities/pricing/constants';

import { ConfigSelect } from './VolumeDrawer/ConfigSelect';
import { SizeField } from './VolumeDrawer/SizeField';

import type { VolumeEncryption } from '@linode/api-v4';
import type { Linode } from '@linode/api-v4/lib/linodes/types';
import type { Theme } from '@mui/material/styles';

export const SIZE_FIELD_WIDTH = 160;

const useStyles = makeStyles()((theme: Theme) => ({
  agreement: {
    maxWidth: '70%',
    [theme.breakpoints.down('sm')]: {
      maxWidth: 'unset',
    },
  },
  button: {
    marginTop: theme.spacing(2),
    [theme.breakpoints.down('md')]: {
      marginRight: theme.spacing(),
    },
  },
  buttonGroup: {
    marginTop: theme.spacing(3),
    [theme.breakpoints.down('sm')]: {
      justifyContent: 'flex-end',
    },
  },
  copy: {
    marginBottom: theme.spacing(),
    maxWidth: 700,
  },
  labelTooltip: {
    '& .MuiTooltip-tooltip': {
      minWidth: 220,
    },
  },
  linodeConfigSelectWrapper: {
    [theme.breakpoints.down('md')]: {
      alignItems: 'flex-start',
      flexDirection: 'column',
    },
  },
  linodeSelect: {
    marginRight: theme.spacing(4),
  },
  notice: {
    borderColor: theme.color.green,
    fontSize: 15,
    lineHeight: '18px',
  },
  select: {
    [theme.breakpoints.down('sm')]: {
      width: 320,
    },
    width: 400,
  },
  size: {
    position: 'relative',
    width: SIZE_FIELD_WIDTH,
  },
  tooltip: {
    '& .MuiTooltip-tooltip': {
      minWidth: 320,
    },
  },
}));

export const VolumeCreate = () => {
  const theme = useTheme();
  const { classes } = useStyles();
  const history = useHistory();

  const { data: types, isError, isLoading } = useVolumeTypesQuery();

  const { data: profile } = useProfile();
  const { data: grants } = useGrants();

  const { data: regions } = useRegionsQuery();

  const { mutateAsync: createVolume } = useCreateVolumeMutation();

  const { data: accountAgreements } = useAccountAgreements();
  const [hasSignedAgreement, setHasSignedAgreement] = React.useState(false);
  const { mutateAsync: updateAccountAgreements } = useMutateAccountAgreements();

  const {
    isBlockStorageEncryptionFeatureEnabled,
  } = useIsBlockStorageEncryptionFeatureEnabled();

  const regionsWithBlockStorage =
    regions
      ?.filter((thisRegion) =>
        thisRegion.capabilities.includes('Block Storage')
      )
      .map((thisRegion) => thisRegion.id) ?? [];

  const doesNotHavePermission =
    profile?.restricted && !grants?.global.add_volumes;

  const renderSelectTooltip = (tooltipText: string) => {
    return (
      <TooltipIcon
        sxTooltipIcon={{
          marginBottom: '6px',
          marginLeft: theme.spacing(),
          padding: 0,
        }}
        classes={{ popper: classes.tooltip }}
        status="help"
        text={tooltipText}
        tooltipPosition="right"
      />
    );
  };

  const { enqueueSnackbar } = useSnackbar();

  const {
    errors,
    handleBlur,
    handleChange,
    handleSubmit,
    isSubmitting,
    setFieldValue,
    status: error,
    touched,
    values,
  } = useFormik({
    initialValues,
    onSubmit: (values, { resetForm, setErrors, setStatus, setSubmitting }) => {
      const { config_id, encryption, label, linode_id, region, size } = values;

      setSubmitting(true);

      /** Status holds our success and generalError messages. */
      setStatus(undefined);

      // If the BSE feature is not enabled or the selected region does not support BSE, set `encryption` in the payload to undefined.
      // Otherwise, set it to `enabled` if the checkbox is checked, or `disabled` if it is not
      const blockStorageEncryptionPayloadValue =
        !isBlockStorageEncryptionFeatureEnabled ||
        !regionSupportsBlockStorageEncryption
          ? undefined
          : encryption;

      createVolume({
        config_id:
          config_id === null ? undefined : maybeCastToNumber(config_id),
        encryption: blockStorageEncryptionPayloadValue,
        label,
        linode_id:
          linode_id === null ? undefined : maybeCastToNumber(linode_id),
        region: isNilOrEmpty(region) || region === 'none' ? undefined : region,
        size: maybeCastToNumber(size),
      })
        .then((volume) => {
          if (hasSignedAgreement) {
            updateAccountAgreements({
              eu_model: true,
              privacy_policy: true,
            }).catch(reportAgreementSigningError);
          }

          resetForm({ values: initialValues });
          setSubmitting(false);
          enqueueSnackbar(`Volume scheduled for creation.`, {
            variant: 'success',
          });
          history.push('/volumes', { volume });
          // Analytics Event
          sendCreateVolumeEvent(`Size: ${size}GB`, origin);
        })
        .catch((errorResponse) => {
          setSubmitting(false);
          handleFieldErrors(setErrors, errorResponse);
          handleGeneralErrors(
            setStatus,
            errorResponse,
            `Unable to create a volume at this time. Please try again later.`
          );
        });
    },
    validationSchema: CreateVolumeSchema,
  });

  const { config_id, linode_id } = values;

  const linodeError = touched.linode_id ? errors.linode_id : undefined;

  const { showGDPRCheckbox } = getGDPRDetails({
    agreements: accountAgreements,
    profile,
    regions,
    selectedRegionId: values.region,
  });

  const isInvalidPrice = !types || isError;

  const disabled = Boolean(
    doesNotHavePermission ||
      (showGDPRCheckbox && !hasSignedAgreement) ||
      isInvalidPrice
  );

  const handleLinodeChange = (linode: Linode | null) => {
    if (linode !== null) {
      setFieldValue('linode_id', linode.id);
      setFieldValue('region', linode.region);
    } else {
      setFieldValue('linode_id', null);
      setFieldValue('config_id', null);
    }
  };

  const regionSupportsBlockStorageEncryption = doesRegionSupportFeature(
    values.region ?? '',
    regions ?? [],
    'Block Storage Encryption'
  );

  const toggleVolumeEncryptionEnabled = (
    encryption: VolumeEncryption | undefined
  ) => {
    if (encryption === 'enabled') {
      setFieldValue('encryption', 'disabled');
    } else {
      setFieldValue('encryption', 'enabled');
    }
  };

  return (
    <>
      <DocumentTitleSegment segment="Create a Volume" />
      <LandingHeader
        breadcrumbProps={{
          crumbOverrides: [
            {
              label: 'Volumes',
              position: 1,
            },
          ],
          pathname: location.pathname,
        }}
        title="Create"
      />
      {doesNotHavePermission && (
        <Notice
          text={getRestrictedResourceText({
            action: 'create',
            resourceType: 'Volumes',
          })}
          important
          spacingTop={16}
          variant="error"
        />
      )}
      <form onSubmit={handleSubmit}>
        <Box display="flex" flexDirection="column">
          <Paper>
            <Typography
              className={classes.copy}
              data-qa-volume-size-help
              variant="body1"
            >
              <span>
                A single Volume can range from 10 to {MAX_VOLUME_SIZE} GB in
                size. Up to to eight Volumes can be attached to a single Linode.
                Select a region to see cost per GB.
              </span>
            </Typography>
            {error && (
              <Notice spacingBottom={0} spacingTop={12} variant="error">
                <ErrorMessage entityType="volume_id" message={error} />
              </Notice>
            )}
            <TextField
              tooltipText="Use only ASCII letters, numbers,
                  underscores, and dashes."
              className={classes.select}
              data-qa-volume-label
              disabled={doesNotHavePermission}
              errorText={touched.label ? errors.label : undefined}
              label="Label"
              name="label"
              onBlur={handleBlur}
              onChange={handleChange}
              tooltipClasses={classes.labelTooltip}
              tooltipPosition="right"
              value={values.label}
            />
            <Box alignItems="flex-end" display="flex">
              <RegionSelect
                onChange={(e, region) => {
                  setFieldValue('region', region?.id ?? null);
                  setFieldValue('linode_id', null);
                }}
                currentCapability="Block Storage"
                disabled={doesNotHavePermission}
                errorText={touched.region ? errors.region : undefined}
                label="Region"
                onBlur={handleBlur}
                regions={regions ?? []}
                value={values.region}
                width={400}
              />
              {renderSelectTooltip(
                'Volumes must be created in a region. You can choose to create a Volume in a region and attach it later to a Linode in the same region.'
              )}
            </Box>
            <Box
              alignItems="flex-end"
              className={classes.linodeConfigSelectWrapper}
              display="flex"
            >
              <Box
                alignItems="flex-end"
                className={classes.linodeSelect}
                display="flex"
              >
                <LinodeSelect
                  optionsFilter={(linode: Linode) => {
                    const linodeRegion = linode.region;
                    const valuesRegion = values.region;

                    /** When values.region is empty, all Linodes with
                     * block storage support will be displayed, regardless
                     * of their region. However, if a region is selected,
                     * only Linodes from the chosen region with block storage
                     * support will be shown. */
                    return isNilOrEmpty(valuesRegion)
                      ? regionsWithBlockStorage.includes(linodeRegion)
                      : regionsWithBlockStorage.includes(linodeRegion) &&
                          linodeRegion === valuesRegion;
                  }}
                  sx={{
                    [theme.breakpoints.down('sm')]: {
                      width: 320,
                    },
                    width: '400px',
                  }}
                  clearable
                  disabled={doesNotHavePermission}
                  errorText={linodeError}
                  onBlur={handleBlur}
                  onSelectionChange={handleLinodeChange}
                  value={values.linode_id}
                />
                {renderSelectTooltip(
                  'If you select a Linode, the Volume will be automatically created in that Linode’s region and attached upon creation.'
                )}
              </Box>
              <ConfigSelect
                disabled={doesNotHavePermission || config_id === null}
                error={touched.config_id ? errors.config_id : undefined}
                linodeId={linode_id}
                name="configId"
                onBlur={handleBlur}
                onChange={(id: number) => setFieldValue('config_id', id)}
                value={config_id}
                width={[theme.breakpoints.down('sm')] ? 320 : 400}
              />
            </Box>
            <Box alignItems="flex-end" display="flex" position="relative">
              <SizeField
                disabled={doesNotHavePermission}
                error={touched.size ? errors.size : undefined}
                hasSelectedRegion={!isNilOrEmpty(values.region)}
                name="size"
                onBlur={handleBlur}
                onChange={handleChange}
                regionId={values.region}
                textFieldStyles={classes.size}
                value={values.size}
              />
            </Box>
            <Box
              alignItems="center"
              className={classes.buttonGroup}
              display="flex"
              flexWrap="wrap"
              justifyContent={showGDPRCheckbox ? 'space-between' : 'flex-end'}
            >
              {showGDPRCheckbox ? (
                <EUAgreementCheckbox
                  centerCheckbox
                  checked={hasSignedAgreement}
                  className={classes.agreement}
                  onChange={(e) => setHasSignedAgreement(e.target.checked)}
                />
              ) : null}
            </Box>
            {isBlockStorageEncryptionFeatureEnabled && (
              <Box>
                <Encryption
                  disabledReason={
                    values.region
                      ? BLOCK_STORAGE_ENCRYPTION_UNAVAILABLE_IN_REGION_COPY
                      : BLOCK_STORAGE_CHOOSE_REGION_COPY
                  }
                  notices={
                    values.encryption === 'enabled'
                      ? [
                          BLOCK_STORAGE_ENCRYPTION_OVERHEAD_CAVEAT,
                          BLOCK_STORAGE_USER_SIDE_ENCRYPTION_CAVEAT,
                        ]
                      : []
                  }
                  onChange={() =>
                    toggleVolumeEncryptionEnabled(values.encryption)
                  }
                  descriptionCopy={BLOCK_STORAGE_ENCRYPTION_GENERAL_DESCRIPTION}
                  disabled={!regionSupportsBlockStorageEncryption}
                  entityType="Volume"
                  isEncryptEntityChecked={values.encryption === 'enabled'}
                />
              </Box>
            )}
          </Paper>
          <Box display="flex" justifyContent="flex-end">
            <Button
              tooltipText={
                !isLoading && isInvalidPrice
                  ? PRICES_RELOAD_ERROR_NOTICE_TEXT
                  : ''
              }
              buttonType="primary"
              className={classes.button}
              data-qa-deploy-linode
              disabled={disabled}
              loading={isSubmitting}
              style={{ marginLeft: 12 }}
              type="submit"
            >
              Create Volume
            </Button>
          </Box>
        </Box>
      </form>
    </>
  );
};

interface FormState {
  config_id: null | number;
  encryption: VolumeEncryption | undefined;
  label: string;
  linode_id: null | number;
  region: string;
  size: number;
}

const initialValues: FormState = {
  config_id: null,
  encryption: 'disabled',
  label: '',
  linode_id: null,
  region: '',
  size: 20,
};
