const site = {
  title: 'What’s in the Glass',
  tagline:
    'Search a ZIP code or city to see what the federal government publishes about the local water system—and what it does not.',
  dataStatus: 'periodic',
  nav: [{ path: '/', label: 'Check your water' }],
  support: {
    label: 'Support the author',
    url: 'https://gourmetdata.substack.com/subscribe',
  },
  attribution: {
    sourceName: 'EPA ECHO SDWIS quarterly download',
    sourceOrg:
      'location lookup via Zippopotam.us and Open-Meteo; live violation details via Envirofacts; historical scenarios cite their own published sources',
    sourceUrl: 'https://echo.epa.gov/tools/data-downloads',
    note: 'Federal data describes a public water system, not every tap. Lead is a system-wide 90th-percentile sample; missing data is shown as missing, never as clean.',
  },
};

export default site;
