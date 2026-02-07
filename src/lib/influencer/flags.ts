export function isRecommendationFeatureEnabledServer(): boolean {
  return process.env.INFLUENCER_RECOMMENDATIONS_ENABLED === 'true';
}

export function isRecommendationFeatureEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_INFLUENCER_RECOMMENDATIONS_ENABLED === 'true';
}

export function shouldFilterTestData(): boolean {
  if (process.env.INFLUENCER_FILTER_TEST_DATA === 'false') return false;
  return true;
}

export function allowTestFixtureIngestion(): boolean {
  return process.env.ALLOW_TEST_FIXTURE_DATA === 'true';
}

export function isCacheEnabled(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
