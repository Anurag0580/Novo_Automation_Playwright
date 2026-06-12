pipeline {
    agent any

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
                bat 'npx playwright install chromium'
            }
        }

        stage('Run Tests') {
            steps {
                bat 'npx playwright test --project=chromium'
            }
        }
    }

    post {
    always {

        archiveArtifacts(
            artifacts: '''
playwright-report/**,
test-results/**/*.png,
test-results/**/*.webm,
test-results/**/*.zip
''',
            allowEmptyArchive: true,
            fingerprint: true
        )

        publishHTML([
            allowMissing: true,
            alwaysLinkToLastBuild: true,
            keepAll: true,
            reportDir: 'playwright-report',
            reportFiles: 'index.html',
            reportName: 'Playwright Report'
        ])
    }
}
}