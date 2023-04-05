import Layout from '@theme/Layout';
import React from 'react';
import styles from './index.module.css';

export default function PricingPage(): JSX.Element {
  return (
    <Layout title="Pricing">
      <div className={styles.pagePadding}>
        <div className={styles.aboutTitle}>
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
                  Developer
                  <sup>
                    <a href="#note2">2</a>
                  </sup>
                </th>
                <th>
                  Production
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
                  <a href="https://buy.stripe.com/fZeeXv2Or0uM1MY3cd">$300/mo</a>
                </td>
                <td>
                  <a href="https://buy.stripe.com/8wM3eN74HelC9fqeUU">$2,000/mo</a>
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
                <td></td>
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
                <td>1,000</td>
                <td>50,000</td>
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
                <td>1,000</td>
                <td>5,000</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>Emails Sent</td>
                <td>None</td>
                <td>50/mo</td>
                <td>500/mo</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>Open Onboarding</td>
                <td>Testing only</td>
                <td>Testing only</td>
                <td>✔️</td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>Custom Domains</td>
                <td>None</td>
                <td>None</td>
                <td>1</td>
                <td>Contact us</td>
                <td></td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>Pre-built Integrations</td>
                <td></td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td></td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>Single Tenant</td>
                <td></td>
                <td></td>
                <td></td>
                <td>Contact us</td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td>Support</td>
                <td>
                  Discord
                  <br />
                  GitHub
                </td>
                <td>
                  Discord
                  <br />
                  GitHub
                </td>
                <td>
                  Slack
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
                <td></td>
                <td>✔️</td>
                <td>DIY</td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>Observability Suite</td>
                <td></td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td>DIY</td>
                <td>✔️</td>
              </tr>
              <tr>
                <td>SAML</td>
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
                <td>5</td>
                <td>20</td>
                <td>Contact us</td>
                <td>DIY</td>
                <td>Contact us</td>
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
                <td>DIY</td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>CLIA/CAP</td>
                <td></td>
                <td></td>
                <td></td>
                <td>Contact us</td>
                <td>DIY</td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>ONC</td>
                <td></td>
                <td></td>
                <td>✔️</td>
                <td>Contact us</td>
                <td>DIY</td>
                <td>Contact us</td>
              </tr>
              <tr>
                <td>
                  <strong>Sign Up</strong>
                </td>
                <td></td>
                <td>
                  <a href="https://buy.stripe.com/fZeeXv2Or0uM1MY3cd">Start Now</a>
                </td>
                <td>
                  <a href="https://buy.stripe.com/bIY16F88LgtKfDO146">Start Now</a>
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
                <strong>Developer</strong>: recommended for developer environments or test environments.
              </li>
              <li id="note3">
                <strong>Production</strong>: recommended for production use, e.g. treatment of patients or conducting
                research.
              </li>
              <li id="note4">
                <strong>Enterprise</strong>: recommended for institutions with complex workflow, integration or data
                requirements.
              </li>
              <li id="note5">
                <strong>Community</strong>: refers to self-hosting the{' '}
                <a href="https://github.com/medplum/medplum">Medplum application</a>.
              </li>
              <li id="note6">
                <strong>Enterprise Managed</strong>: recommended for those who must host the application on their own
                cloud infrastructure.
              </li>
              <li id="note7">
                Data usage refers to the creation of{' '}
                <a href="https://www.medplum.com/docs/fhir-datastore/create-fhir-data">FHIR Resources</a>. This figure
                is cumulative.
              </li>
              <li id="note8">
                Bots and automation refer to custom logic written by customers to execute their workflow.{' '}
                <a href="https://www.medplum.com/products/bots">Automation</a> documentation and{' '}
                <a href="https://www.medplum.com/products/integration">integration</a> are a good place to learn more.
              </li>
              <li id="note9">Organizations can require that all logins go through Google Authentication.</li>
              <li id="note10">
                Many complex compliance scenarios can be supported with this infrastructure. You can read more on the{' '}
                <a href="https://www.medplum.com/docs/compliance">compliance page</a>.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </Layout>
  );
}
