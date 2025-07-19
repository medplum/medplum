import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { JSX } from 'react';
import { Container } from '../components/Container';
import styles from './pricing.module.css';

export default function PricingPage(): JSX.Element {
  return (
    <Layout title="Pricing">
      <Container>
        <div className={styles.pricing}>
          <h1>Pricing</h1>
          <p style={{ maxWidth: 600, margin: '20px auto' }}>
            For questions about pricing or to <Link href="https://cal.com/medplum/15">schedule a demo</Link> please
            reach out to us at <Link href="mailto:hello@medplum.com">hello@medplum.com</Link>.
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
                <th colSpan={4}>
                  Cloud Hosted
                  <sup>
                    <a href="#note17">17</a>
                  </sup>
                </th>
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
                  Enterprise
                  <sup>
                    <a href="#note4">4</a>
                  </sup>
                </th>
                <th>
                  Community
                  <sup>
                    <a href="#note5">5</a>
                  </sup>
                </th>
                <th>
                  Enterprise
                  <sup>
                    <a href="#note6">6</a>
                  </sup>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pricing</td>
                <td>Free</td>
                <td>
                  <Link href="https://buy.stripe.com/8wM3eN74HelC9fqeUU">$2,000/mo</Link>
                </td>
                <td>
                  <Link href="https://buy.stripe.com/6oEbLj9cPb9q63e4gk">$6,000/mo</Link>
                </td>
                <td>
                  <Link href="https://forms.gle/ZQZq1iWjjWMkUwc9A">Contact us</Link>
                </td>
                <td>Free</td>
                <td>
                  <Link href="https://forms.gle/ZQZq1iWjjWMkUwc9A">Contact us</Link>
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
                  Bots
                  <sup>
                    <a href="#note7">7</a>
                  </sup>
                </td>
                <td>Not enabled</td>
                <td>Enabled</td>
                <td>Enabled</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>Emails Sent</td>
                <td>Not enabled</td>
                <td>Not enabled</td>
                <td>Enabled</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>Usage</td>
                <td>
                  Test
                  <sup>
                    <a href="#note13">13</a>
                  </sup>
                </td>
                <td>
                  Growth
                  <sup>
                    <a href="#note14">14</a>
                  </sup>
                </td>
                <td>
                  Scale
                  <sup>
                    <a href="#note15">15</a>
                  </sup>
                </td>
                <td>
                  Enterprise
                  <sup>
                    <a href="#note16">16</a>
                  </sup>
                </td>
                <td></td>
                <td>
                  Enterprise
                  <sup>
                    <a href="#note16">16</a>
                  </sup>
                </td>
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
                <td>✔️</td>
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
                    <a href="#note10">10</a>
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
                <td>Concurrent Websocket Connections</td>
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
                  Email (SLA)
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
                    <a href="#note8">8</a>
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
                    <a href="#note12">12</a>
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
                    <a href="#note9">9</a>
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
                    <a href="#note11">11</a>
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
                  <Link href="https://buy.stripe.com/bIY16F88LgtKfDO146">Start Now</Link>
                </td>
                <td>
                  <Link href="https://buy.stripe.com/6oEbLj9cPb9q63e4gk">Start Now</Link>
                </td>
                <td>
                  <Link href="https://forms.gle/ZQZq1iWjjWMkUwc9A">Contact Us</Link>
                </td>
                <td></td>
                <td>
                  <Link href="https://forms.gle/ZQZq1iWjjWMkUwc9A">Contact Us</Link>
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
                <strong>Production</strong>: recommended for production applications, e.g. treatment of patients or
                conducting research.
              </li>
              <li id="note3">
                <strong>Premium</strong>: Includes diagnostics, lab and medication integrations. Recommended for
                messaging heavy and integration heavy use cases.
              </li>
              <li id="note4">
                <strong>Enterprise</strong>: recommended for institutions with complex workflow, integration or data
                requirements. Read more details on our <Link href="/enterprise">Enterprise</Link> offering page.
              </li>
              <li id="note5">
                <strong>Community</strong>: refers to self-hosting the{' '}
                <Link href="https://github.com/medplum/medplum">Medplum application</Link>.
              </li>
              <li id="note6">
                <strong>Enterprise Self-Hosted</strong>: recommended for those who must host the application on their
                own cloud infrastructure. Read more details on our <Link href="/enterprise">Enterprise</Link> offering
                page.
              </li>
              <li id="note7">
                <strong>Bot Invocations</strong>: refers to custom logic written by customers to execute their workflow.{' '}
                <Link href="https://www.medplum.com/products/bots">Automation</Link> documentation and{' '}
                <Link href="https://www.medplum.com/products/integration">integration</Link> are a good place to learn
                more.
              </li>
              <li id="note8">
                <strong>Required authentication methods</strong>: Organizations can require that all logins at their
                domain go through their identity provider of choice.
              </li>
              <li id="note9">
                <strong>Compliance</strong>: Many complex compliance scenarios can be supported with this
                infrastructure. You can read more on the{' '}
                <Link href="https://www.medplum.com/docs/compliance">compliance page</Link>.
              </li>
              <li id="note10">
                <strong>Websocket Subscriptions</strong>: maximal number of concurrent websocket{' '}
                <Link href="https://www.medplum.com/docs/subscriptions">subscriptions</Link> available.
              </li>
              <li id="note11">
                <strong>Audit Support</strong>: receive support during common audits common in health system and payor
                partnerships.
              </li>
              <li id="note12">
                <strong>External Identity Providers</strong>: connect your Okta, Azure SSO, Auth0 or other oAuth based
                identity provider.
              </li>
              <li id="note13">
                <strong> Test Usage</strong>: For low-volume use cases such as development, testing, or small internal
                tools.
              </li>
              <li id="note14">
                <strong> Growth Usage</strong>: Supports moderate usage typical of production deployments or lightweight
                applications.
              </li>
              <li id="note15">
                <strong> Scale Usage</strong>: Designed for high-throughput environments with sustained and growing
                traffic.
              </li>
              <li id="note16">
                <strong> Enterprise Usage</strong>: Handles very high or mission-critical volumes, with customization
                and service level guarantees.
              </li>
              <li id="note17">
                <strong> Cloud Hosted</strong>: Medplum is available for purchase through{' '}
                <Link href="https://aws.amazon.com/marketplace/pp/prodview-gfbi35l2l7mma?sr=0-1&ref_=beagle&applicationId=AWSMPContessa">
                  AWS Marketplace
                </Link>
                .
              </li>
            </ol>
          </div>
        </div>
      </Container>
    </Layout>
  );
}
