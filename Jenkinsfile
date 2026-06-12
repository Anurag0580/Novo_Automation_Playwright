pipeline {
    agent any

    environment {
        LOGIN_EMAIL = credentials('novo-uae-login-email')
        LOGIN_PASSWORD = credentials('novo-uae-login-password')
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

            echo """

========================================================

🚀 Novo UAE Regression

🌐 Environment : UAE
🌍 Browser      : Chromium
🌿 Branch       : uae-preprod
🔨 Build        : #${env.BUILD_NUMBER}
⏱ Duration      : ${currentBuild.durationString}

📄 HTML Report
${env.BUILD_URL}Playwright_20Report/

📦 Artifacts
✅ HTML Report
✅ Screenshots
✅ Videos
✅ Traces

========================================================

"""
        }
    }
}
}