pipeline {
    agent any

    environment {
        LOGIN_EMAIL = credentials('novo-qa-login-email')
        LOGIN_PASSWORD = credentials('novo-qa-login-password')
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Create .env') {
            steps {
                bat '''
(
echo PROD_FRONTEND_URL=%PROD_FRONTEND_URL%
echo PROD_BACKEND_URL=%PROD_BACKEND_URL%
echo REAL_DOMAIN_URL=%REAL_DOMAIN_URL%
echo LOGIN_EMAIL=%LOGIN_EMAIL%
echo LOGIN_PASSWORD=%LOGIN_PASSWORD%
echo LOGIN_PHONE=%LOGIN_PHONE%
echo VALID_EMAIL=%VALID_EMAIL%
echo VALID_PASSWORD=%VALID_PASSWORD%
) > .env
'''
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm ci'
            }
        }

        stage('Install Chromium') {
            steps {
                bat 'npx playwright install --with-deps chromium'
            }
        }

        stage('Run Tests') {
            steps {
                catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
                    bat 'npx playwright test --project=chromium'
                }
            }
        }
    }

    post {
        always {

            archiveArtifacts(
                artifacts: '''
playwright-report/**,
test-results/**,
blob-report/**
''',
                allowEmptyArchive: true,
                fingerprint: true
            )

            junit(
                testResults: 'playwright-report/results.xml',
                allowEmptyResults: true,
                keepLongStdio: true
            )

            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright Report'
            ])

            script {

                if (!fileExists('playwright-report/results.json')) {
                    echo "⚠️ results.json not found. Skipping summary."
                } else {

                    def results = readJSON file: 'playwright-report/results.json'

                    def passed = results?.stats?.expected ?: 0
                    def failed = results?.stats?.unexpected ?: 0
                    def skipped = results?.stats?.skipped ?: 0
                    def flaky = results?.stats?.flaky ?: 0

                    long durationMs = (results?.stats?.duration ?: 0) as long
                    long minutes = durationMs / 60000
                    long seconds = (durationMs % 60000) / 1000

                    def failedTests = []

                    def collectFailedTests
                    collectFailedTests = { node ->

                        if (node instanceof Map) {

                            if (node.containsKey("title") && node.containsKey("tests")) {

                                node.tests?.each { t ->

                                    boolean isFailed = false

                                    t.results?.each { r ->
                                        if (r.status == "failed") {
                                            isFailed = true
                                        }
                                    }

                                    if (isFailed) {
                                        failedTests << node.title
                                    }
                                }
                            }

                            node.values().each { value ->
                                collectFailedTests(value)
                            }
                        }

                        if (node instanceof List) {
                            node.each {
                                collectFailedTests(it)
                            }
                        }
                    }

                    collectFailedTests(results)

                    echo """

========================================================

🚀 Novo Qatar Regression

🟢 Passed      : ${passed}
🔴 Failed      : ${failed}
🟡 Skipped     : ${skipped}
🟠 Flaky       : ${flaky}

⏱ Duration     : ${minutes} min ${seconds} sec

🌐 Environment : Qatar
🌍 Browser      : Chromium
🌿 Branch       : stable-preprod
🔨 Build        : #${env.BUILD_NUMBER}

📄 HTML Report

${env.BUILD_URL}Playwright_20Report/

========================================================

"""

                    if (!failedTests.isEmpty()) {

                        echo ""
                        echo "============== ❌ FAILED TEST CASES =============="
                        echo ""

                        failedTests.unique().each {
                            echo "• ${it}"
                        }

                        echo ""
                        echo "=================================================="
                    }
                }
            }
        }
    }
}