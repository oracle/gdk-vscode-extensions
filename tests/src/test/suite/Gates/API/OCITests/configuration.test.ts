import * as ociAuthentication from '../../../../../../../oci-devops/out/oci/ociAuthentication';
import * as ociUtils from '../../../../../../../oci-devops/out//oci/ociUtils';
import * as assert from 'assert';

export function getProfile(profiles: string[]): string {
  if (profiles.length === 1) return profiles[0];
  else if (profiles.indexOf('TESTS') !== -1) return 'TESTS';
  else if (profiles.indexOf('DEFAULT') !== -1) return 'DEFAULT';
  else {
    return '';
  }
}

suite('Start Testing Configuration', function () {
  const COMPARTMENT_OCID: string = process.env['TEST_DEPLOY_COMPARTMENT_OCID']
    ? process.env['TEST_DEPLOY_COMPARTMENT_OCID']
    : 'ocid1.compartment.oc1..aaaaaaaa7thgaondgokuwyujlq4tosnpfaohdivlbbr64izsx5jxfxrezxca';

  let selectedProfile = '';
  test('Check Default Config', async function () {
    let defaultConfigFile = ociAuthentication.getDefaultConfigFile();
    assert.ok(defaultConfigFile !== '', 'Config File not Found');

    let profiles = ociAuthentication.listProfiles(defaultConfigFile);
    assert.ok(profiles.length > 0, 'No Profile Found');

    selectedProfile = getProfile(profiles);
    assert.ok(selectedProfile !== '', 'No Profile Selected for testing');
  });

  let provider: any;
  test('Check Authentication', async function () {
    let auth = await ociAuthentication.resolve('Authenticate', selectedProfile);
    assert.ok(auth, 'Cannot authenticated');

    let problem = await auth.getConfigurationProblem();
    assert.ok(!problem, 'Authentication Problems: ' + problem);

    provider = auth.getProvider();
    assert.ok(provider, 'Cannot get provider');
  });

  test('Check Networking Connectivity', async function () {
    assert.ok(provider, 'Provider not authenticated');

    let vcns = await ociUtils.listVCNs(provider, COMPARTMENT_OCID);
    assert.ok(vcns.length > 0, 'Virual Networks Not Found');
  });
});
