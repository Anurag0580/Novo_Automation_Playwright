pipeline {
    agent any

    environment {

        PROD_FRONTEND_URL = 'https://uae.novocinemas.com'

        PROD_BACKEND_URL = 'https://uae-api.novocinemas.com'

        REAL_DOMAIN_URL = 'https://www.novocinemas.com'

        LOGIN_EMAIL = 'Anurag.Gupta@enpointe.io'

        LOGIN_PASSWORD = 'Anurag@098'

        LOGIN_PHONE = '9136850580'

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
                bat 'npx playwright install chromium'
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

            publishHTML(target: [
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