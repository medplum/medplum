import Layout from '@theme/Layout';
import { Container } from '../components/Container';
import styles from './pricing.module.css';

export default function PricingPage(): JSX.Element {
  return (
    <Layout title="Pricing">
      <Container>
        <div className={styles.pricing}>
          <h1>Pricing</h1>
          <p style={{ maxWidth: 600, margin: '20px auto' }}>
            For questions about pricing or to schedule a demo please reach out to us at{' '}
            <a href="mailto:hello@medplum.com">hello@medplum.com</a>.
          </p>
          <table style={{ width: 950, margin: 'auto' }}>
            <colgroup>
              <col style={{ width: '22%', borderRight: '2px solid #ccc' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%', borderRight: '2px solid #ccc' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th colSpan={4}>Cloud Hosted</th>
                <th colSpan={2}>Self Hosted</th>
              </tr>
              <tr>
                <th />
                <th>
                  Free
                  <sup>
                    <a href="#note1">1</a>
                  </sup>
                </th>
                <th>
                  Production
                  <sup>
                    <a href="#note2">2</a>
                  </sup>
                </th>
                <th>
                  Premium
                  <sup>
                    <a href="#note3">3</a>
                  </sup>
                </th>
                <th>
                  <a href="https://www.medplum.com/enterprise">Enterprise</a>
                </th>
                <th>
                  Community
                  <sup>
                    <a href="#note5">5</a>
                  </sup>
                </th>
                <th>
                  <a href="https://www.medplum.com/enterprise">Enterprise</a>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pricing</td>
                <td>Free</td>
                <td>
                  <a href="https://buy.stripe.com/8wM3eN74HelC9fqeUU">$2,000/mo</a>
                </td>
                <td>
                  <a href="https://buy.stripe.com/6oEbLj9cPb9q63e4gk">$6,000/mo</a>
                </td>
                <td>
                  <a href="https://forms.gle/ZQZq1iWjjWMkUwc9A">Contact us</a>
                </td>
                <td>Free</td>
                <td>
                  <a href="https://forms.gle/ZQZq1iWjjWMkUwc9A">Contact us</a>
                </td>
              </tr>
              <tr>
                <td>Standard BAA</td>
                <td></td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>Standard MSA</td>
                <td></td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>
                  FHIR Resources Stored
                  <sup>
                    <a href="#note7">7</a>
                  </sup>
                </td>
                <td>500</td>
                <td>50,000</td>
                <td>250,000</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>
                  Bot Invocations
                  <sup>
                    <a href="#note8">8</a>
                  </sup>
                </td>
                <td>None</td>
                <td>5,000/mo</td>
                <td>25,000/mo</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>Emails Sent</td>
                <td>None</td>
                <td>500/mo</td>
                <td>2500/mo</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>Open Onboarding</td>
                <td>Testing only</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>Custom Domains</td>
                <td>None</td>
                <td>1</td>
                <td>5</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>UMLS Terminology</td>
                <td></td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>Dedicated Infrastructure</td>
                <td></td>
                <td></td>
                <td></td>
                <td>Contact us</td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td>
                  <b>Communications</b>
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td>
                  Websocket Subscriptions
                  <sup>
                    <a href="#note11">11</a>
                  </sup>
                </td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>Concurrent Connections</td>
                <td></td>
                <td></td>
                <td>2000</td>
                <td>Contact Us</td>
                <td></td>
                <td>Contact Us</td>
              </tr>
              <tr>
                <td>
                  <b>Integrations</b>
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td>Lab/Diagnostics</td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>Medications/eRx</td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>HL7 Integration Engine</td>
                <td></td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>
                  <b>Support</b>
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td>Channels</td>
                <td>
                  Discord
                  <br />
                  GitHub
                </td>
                <td>
                  Discord (SLA)
                  <br />
                  GitHub (SLA)
                </td>
                <td>
                  Private Slack
                  <br />
                  Email
                </td>
                <td>Contact us</td>
                <td>
                  Discord
                  <br />
                  GitHub
                </td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>Shared Roadmap</td>
                <td></td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>
                  <strong>Security</strong>
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td>Google Auth</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>DIY</td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>
                  Required Auth Methods
                  <sup>
                    <a href="#note9">9</a>
                  </sup>
                </td>
                <td></td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>DIY</td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>
                  External Identity Providers
                  <sup>
                    <a href="#note13">13</a>
                  </sup>
                </td>
                <td></td>
                <td>1</td>
                <td>2</td>
                <td>Contact Us</td>
                <td>DIY</td>
                <td>Contact Us</td>
              </tr>
              <tr>
                <td>WAF Blocking</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>DIY</td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>IP Address Restrictions</td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td>✔️</td>
                <td>DIY</td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>SCIM Administration</td>
                <td></td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td>DIY</td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>Access Policies</td>
                <td>Testing only</td>
                <td>3</td>
                <td>10</td>
                <td>Contact us</td>
                <td>DIY</td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>
                  <strong>Observability</strong>
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td>Log Streaming</td>
                <td></td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td>DIY</td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>CISO Dashboard</td>
                <td></td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>
                  <strong>Compliance</strong>
                  <sup>
                    <a href="#note10">10</a>
                  </sup>
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td>SOC 2</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td>✔️</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>CLIA/CAP</td>
                <td></td>
                <td></td>
                <td></td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>ONC</td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>
                  Audit Support
                  <sup>
                    <a href="#note12">12</a>
                  </sup>
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>
                  <strong>Sign Up</strong>
                </td>
                <td></td>
                <td>
                  <a href="https://buy.stripe.com/bIY16F88LgtKfDO146">Start Now</a>
                </td>
                <td>
                  <a href="https://buy.stripe.com/6oEbLj9cPb9q63e4gk">Start Now</a>
                </td>
                <td>
                  <a href="https://forms.gle/ZQZq1iWjjWMkUwc9A">Contact Us</a>
                </td>
                <td></td>
                <td>
                  <a href="https://forms.gle/ZQZq1iWjjWMkUwc9A">Contact Us</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ maxWidth: 900, margin: '20px auto', lineHeight: 1.75 }}>
            <h3>Notes</h3>
            <ol>
              <li id="note1">
                <strong>Free</strong>: recommended for prototyping or learning.
              </li>
              <li id="note2">
                <strong>Production</strong>: recommended for production use, e.g. treatment of patients or conducting
                research.
              </li>
              <li id="note3">
                <strong>Premium</strong>: recommended messaging heavy and integration heavy use cases.
              </li>
              <li id="note4">
                <strong>Enterprise</strong>: recommended for institutions with complex workflow, integration or data
                requirements. Read more details on our <a href="/enterprise">Enterprise</a> offering page.
              </li>
              <li id="note5">
                <strong>Community</strong>: refers to self-hosting the{' '}
                <a href="https://github.com/medplum/medplum">Medplum application</a>.
              </li>
              <li id="note6">
                <strong>Enterprise Self-Hosted</strong>: recommended for those who must host the application on their
                own cloud infrastructure.
              </li>
              <li id="note7">
                <strong>FHIR Resources Stored</strong>: Data usage refers to the creation of{' '}
                <a href="https://www.medplum.com/docs/fhir-datastore/create-fhir-data">FHIR Resources</a>. This figure
                is cumulative. For Premium, Communication resources that are generated as part of messaging are not
                included in the resource cap shown.
              </li>
              <li id="note8">
                <strong>Bot Invocations</strong>: refers to custom logic written by customers to execute their workflow.{' '}
                <a href="https://www.medplum.com/products/bots">Automation</a> documentation and{' '}
                <a href="https://www.medplum.com/products/integration">integration</a> are a good place to learn more.
              </li>
              <li id="note9">
                <strong>Required authentication methods</strong>: Organizations can require that all logins at their
                domain go through their identity provider of choice.
              </li>
              <li id="note10">
                <strong>Compliance</strong>: Many complex compliance scenarios can be supported with this
                infrastructure. You can read more on the{' '}
                <a href="https://www.medplum.com/docs/compliance">compliance page</a>.
              </li>
              <li id="note11">
                <strong>Websocket Subscriptions</strong>: maximal number of concurrent websocket{' '}
                <a href="https://www.medplum.com/docs/subscriptions">subscriptions</a> available.
              </li>
              <li id="note12">
                <strong>Audit Support</strong>: receive support during common audits common in health system and payor
                partnerships.
              </li>
              <li id="note13">
                <strong>External Identity Providers</strong>: connect your Okta, Azure SSO, Auth0 or other oAuth based
                identity provider.
              </li>
            </ol>
          </div>
        </div>
      </Container>
    </Layout>
  );
}
