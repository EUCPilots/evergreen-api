# GitHub Workflows Documentation

This repository includes comprehensive GitHub Actions workflows to ensure code quality, security, and proper functionality of the Evergreen API.

## 🔄 Workflows Overview

### 1. API Tests (`test.yml`)
**Triggers:** PR creation, pushes to main branches, manual runs, nightly schedule
- ✅ Runs comprehensive API tests against production
- ✅ Multi-Node.js version testing (18.x, 20.x)
- ✅ Code linting and syntax validation
- ✅ Security scanning
- ✅ OpenAPI schema validation
- ✅ Performance testing
- ✅ Automatic PR commenting with results

### 2. Caching Validation (`cache-validation.yml`)
**Triggers:** Changes to caching implementation, manual runs
- ✅ Validates hybrid caching behavior
- ✅ Tests memory cache + KV storage integration
- ✅ Verifies 12-hour TTL configuration
- ✅ Checks cache headers and performance
- ✅ Deployment readiness validation

### 3. Security & Dependencies (`security.yml`)
**Triggers:** Weekly schedule, dependency changes, manual runs
- ✅ Security audit of all dependencies
- ✅ Vulnerability scanning
- ✅ License compliance checking
- ✅ API security testing
- ✅ Rate limiting validation
- ✅ Automatic security issue creation

### 4. Deploy to Staging (`deploy-staging.yml`)
**Triggers:** Pushes to the `staging` branch that touch `src/**` or `tests/**`, manual runs
- ✅ Deploys the worker to `evergreen-api-staging` (`wrangler deploy --env staging`)
- ✅ Waits for `/health` to report `"environment":"staging"`
- ✅ Runs the API test suite against https://evergreen-api-staging.stealthpuppy.workers.dev

## 🎯 Workflow Features

### Adaptive Testing
- **Production API**: Tests work against current live API
- **New Implementation**: Automatically detects and validates new caching features
- **Backwards Compatibility**: Ensures no breaking changes

### Comprehensive Validation
- **Functional Testing**: All endpoints and error conditions
- **Performance Testing**: Response times and caching efficiency
- **Security Testing**: Common vulnerabilities and secure headers
- **Configuration Testing**: Wrangler.toml and binding validation

### Automated Reporting
- **PR Comments**: Automatic test result summaries
- **Artifacts**: Detailed test results and reports
- **Issue Creation**: Automatic security alerts
- **Performance Metrics**: Response time tracking

## 📊 Workflow Status Badges

Add these badges to your README.md to show workflow status:

```markdown
![API Tests](https://github.com/EUCPilots/evergreen-api/workflows/API%20Tests/badge.svg)
![Caching Validation](https://github.com/EUCPilots/evergreen-api/workflows/Caching%20Validation/badge.svg)
![Security & Dependencies](https://github.com/EUCPilots/evergreen-api/workflows/Security%20%26%20Dependencies/badge.svg)
```

## 🚀 Usage Guidelines

### For Pull Requests
1. **Create PR**: Workflows automatically trigger on PR creation
2. **Review Results**: Check PR comments for test results
3. **Fix Issues**: Address any failing tests before merge
4. **Approve**: Merge when all checks pass

### For Releases
1. **Cache Validation**: Verify caching implementation works
2. **Security Check**: Ensure no vulnerabilities
3. **Performance**: Confirm response times are acceptable
4. **Deploy**: Use workflow status as deployment gate

### For Maintenance
- **Weekly Security**: Review security workflow results
- **Dependency Updates**: Address outdated packages
- **Performance Monitoring**: Track cache effectiveness

## 🔧 Configuration

### Required Secrets
- `API_TEST_USERAGENT`: User-Agent sent by the API tests
- `CF_API_TOKEN`: Cloudflare API token with **Workers Scripts: Edit** permission (used by `deploy-staging.yml`)
- `CF_ACCOUNT_ID`: Cloudflare account ID (used by `deploy-staging.yml`)

### Optional Enhancements
- **Slack Integration**: Add webhook URLs for notifications
- **Performance Thresholds**: Set specific response time limits

## 📈 Monitoring

### Key Metrics Tracked
- **Test Pass Rate**: Percentage of tests passing
- **Response Times**: API endpoint performance
- **Cache Hit Rates**: Caching effectiveness
- **Security Score**: Vulnerability assessment

### Performance Baselines
- **Health Endpoint**: < 200ms response time
- **Apps Endpoint**: < 500ms response time
- **Cache Performance**: 2x speed improvement for cached responses

## 🛠️ Troubleshooting

### Common Issues

**Tests Failing on Production**
- Production API may have temporary issues
- Check production API status manually
- Re-run workflow after production recovery

**Security Alerts**
- Review dependency audit results
- Update packages with `npm audit fix`
- Check for false positives in security scans

**Performance Degradation**
- Compare current vs historical response times
- Check if caching is working properly
- Verify KV/R2 binding availability

### Getting Help
1. Check workflow logs for detailed error messages
2. Review uploaded artifacts for test results
3. Compare against previous successful runs
4. Manually test failing endpoints

## 📝 Contributing

When modifying workflows:
1. Test changes in a fork first
2. Update this documentation for new features
3. Ensure backwards compatibility
4. Add appropriate error handling

---

**Note**: These workflows are designed to work with both the current production API and your new hybrid caching implementation. They automatically adapt based on detected features.