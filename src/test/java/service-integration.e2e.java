package com.example.backendjava.e2e;

import com.example.backendjava.BackendJavaApplication;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.web.server.LocalServerPort;
import org.springframework.http.*;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = BackendJavaApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class ServiceIntegrationE2ETest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    private String baseUrl;

    private String authToken;

    @BeforeEach
    void setup() {
        baseUrl = "http://localhost:" + port;
        // Initialize service specific test data or state here if needed
    }

    @AfterEach
    void teardown() {
        // Clean up test data or reset service state here if needed
    }

    /**
     * Helper to authenticate and get JWT or token if authentication is required.
     */
    private void authenticateUser() {
        // Assuming authentication endpoint POST /api/auth/login and returns token
        String authUrl = baseUrl + "/api/auth/login";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        String loginBody = """
                {
                    "username": "testUser",
                    "password": "testPassword"
                }
                """;

        HttpEntity<String> request = new HttpEntity<>(loginBody, headers);
        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(authUrl, request, AuthResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getToken()).isNotBlank();

        this.authToken = response.getBody().getToken();
    }

    @Nested
    @DisplayName("End-to-end service integration workflow tests")
    class ServiceIntegrationWorkflowTests {

        @Test
        @DisplayName("Successful end-to-end workflow execution")
        void testCompleteWorkflowSuccess() {
            // Authenticate user if required
            authenticateUser();

            // Prepare headers with authentication
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(authToken);
            headers.setContentType(MediaType.APPLICATION_JSON);

            // Step 1: Initialize Service - POST /api/service/init
            HttpEntity<String> initRequest = new HttpEntity<>(null, headers);
            ResponseEntity<ServiceInitResponse> initResponse = restTemplate.postForEntity(
                    baseUrl + "/api/service/init", initRequest, ServiceInitResponse.class);

            assertThat(initResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(initResponse.getBody()).isNotNull();
            assertThat(initResponse.getBody().isInitialized()).isTrue();

            // Step 2: Execute Workflow - POST /api/service/execute with some payload
            String workflowPayload = """
                {
                    "workflowParam": "value",
                    "count": 3
                }
                """;

            HttpEntity<String> executeRequest = new HttpEntity<>(workflowPayload, headers);
            ResponseEntity<WorkflowResponse> executeResponse = restTemplate.postForEntity(
                    baseUrl + "/api/service/execute", executeRequest, WorkflowResponse.class);

            assertThat(executeResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(executeResponse.getBody()).isNotNull();
            assertThat(executeResponse.getBody().getStatus()).isEqualTo("success");
            assertThat(executeResponse.getBody().getResult()).isNotEmpty();

            // Step 3: Verify output - GET /api/service/result
            HttpEntity<Void> getResultRequest = new HttpEntity<>(headers);
            ResponseEntity<ServiceResult> resultResponse = restTemplate.exchange(
                    baseUrl + "/api/service/result",
                    HttpMethod.GET,
                    getResultRequest,
                    ServiceResult.class);

            assertThat(resultResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resultResponse.getBody()).isNotNull();
            assertThat(resultResponse.getBody().getData()).isNotEmpty();

            // Additional logical verifications depending on expected output
            assertThat(resultResponse.getBody().getData()).contains("expectedValue");
        }

        @Test
        @DisplayName("Unauthorized access returns 401")
        void testUnauthorizedAccess() {
            // Do not authenticate user on purpose

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<String> initRequest = new HttpEntity<>(null, headers);
            ResponseEntity<String> initResponse = restTemplate.postForEntity(
                    baseUrl + "/api/service/init", initRequest, String.class);

            assertThat(initResponse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        @DisplayName("Execute workflow with invalid input returns 400")
        void testWorkflowInvalidInput() {
            authenticateUser();

            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(authToken);
            headers.setContentType(MediaType.APPLICATION_JSON);

            // Invalid payload - missing required param 'workflowParam'
            String invalidPayload = """
                {
                    "count": -1
                }
                """;

            HttpEntity<String> executeRequest = new HttpEntity<>(invalidPayload, headers);
            ResponseEntity<String> executeResponse = restTemplate.postForEntity(
                    baseUrl + "/api/service/execute", executeRequest, String.class);

            assertThat(executeResponse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(executeResponse.getBody()).contains("validation error");
        }

        @Test
        @DisplayName("Service returns 500 on internal error during workflow execution")
        void testWorkflowInternalServerError() {
            authenticateUser();

            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(authToken);
            headers.setContentType(MediaType.APPLICATION_JSON);

            // Payload crafted to trigger internal error, e.g. count too high or special flag
            String errorPayload = """
                {
                    "workflowParam": "triggerError",
                    "count": 99999
                }
                """;

            HttpEntity<String> executeRequest = new HttpEntity<>(errorPayload, headers);
            ResponseEntity<String> executeResponse = restTemplate.postForEntity(
                    baseUrl + "/api/service/execute", executeRequest, String.class);

            assertThat(executeResponse.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(executeResponse.getBody()).contains("Internal error occurred");
        }
    }

    // DTO classes for response deserialization

    static class AuthResponse {
        private String token;

        public String getToken() {
            return token;
        }

        public void setToken(String token) {
            this.token = token;
        }
    }

    static class ServiceInitResponse {
        private boolean initialized;

        public boolean isInitialized() {
            return initialized;
        }

        public void setInitialized(boolean initialized) {
            this.initialized = initialized;
        }
    }

    static class WorkflowResponse {
        private String status;
        private String result;

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public String getResult() {
            return result;
        }

        public void setResult(String result) {
            this.result = result;
        }
    }

    static class ServiceResult {
        private String data;

        public String getData() {
            return data;
        }

        public void setData(String data) {
            this.data = data;
        }
    }
}