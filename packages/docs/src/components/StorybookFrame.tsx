export function StorybookFrame(): JSX.Element {
  const host = window.location.host;
  const hostname = window.location.hostname;
  // Default src for production
  let srcUrl = 'https://storybook.medplum.com/';
  // For testing on localhost
  if (hostname === 'localhost') {
    srcUrl = 'http://localhost:6006/';
  }
  // For vercel preview
  else if (host.startsWith('medplum-www-git') && host.endsWith('vercel.app')) {
    srcUrl = window.origin.replace('www', 'storybook');
  }
  return (
    <iframe
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        boxShadow: 'var(--img-block-shadow)',
        overflow: 'hidden',
        backgroundColor: 'transparent',
        border: '0px none transparent',
        padding: '0px',
      }}
      src={srcUrl}
    />
  );
}
