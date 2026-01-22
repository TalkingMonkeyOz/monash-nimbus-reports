use reqwest::{Client, ClientBuilder};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;
use urlencoding::encode;

use crate::types::HttpResponse;

fn build_client(timeout_seconds: Option<u64>) -> Result<Client, String> {
    let timeout = Duration::from_secs(timeout_seconds.unwrap_or(30));

    ClientBuilder::new()
        .timeout(timeout)
        .cookie_store(true)
        .user_agent("MonashNimbusReports/1.0 (Tauri; Rust)")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

fn build_headers(
    custom_headers: Option<HashMap<String, String>>,
    user_id: Option<i32>,
    auth_token: Option<String>,
) -> Result<reqwest::header::HeaderMap, String> {
    let mut headers = reqwest::header::HeaderMap::new();

    // CRITICAL: Nimbus REST API returns XML by default - we MUST request JSON
    headers.insert(
        reqwest::header::ACCEPT,
        "application/json".parse()
            .map_err(|e| format!("Invalid Accept header: {}", e))?,
    );
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        "application/json".parse()
            .map_err(|e| format!("Invalid Content-Type header: {}", e))?,
    );

    // Nimbus requires UserID header
    if let Some(user_id) = user_id {
        headers.insert(
            "UserID",
            user_id.to_string().parse()
                .map_err(|e| format!("Invalid UserID header: {}", e))?,
        );
    }

    if let Some(ref token) = auth_token {
        // Nimbus requires both Authorization Bearer AND AuthenticationToken headers
        let auth_value = format!("Bearer {}", token);
        headers.insert(
            reqwest::header::AUTHORIZATION,
            auth_value.parse()
                .map_err(|e| format!("Invalid authorization header: {}", e))?,
        );

        headers.insert(
            "AuthenticationToken",
            token.parse()
                .map_err(|e| format!("Invalid AuthenticationToken header: {}", e))?,
        );
    }

    if let Some(custom) = custom_headers {
        for (key, value) in custom {
            let header_name = reqwest::header::HeaderName::from_bytes(key.as_bytes())
                .map_err(|e| format!("Invalid header key '{}': {}", key, e))?;
            let header_value = reqwest::header::HeaderValue::from_str(&value)
                .map_err(|e| format!("Invalid header value for '{}': {}", key, e))?;
            headers.insert(header_name, header_value);
        }
    }

    Ok(headers)
}

async fn response_to_http_response(response: reqwest::Response) -> Result<HttpResponse, String> {
    let status = response.status().as_u16();

    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value_str) = value.to_str() {
            headers.insert(key.to_string(), value_str.to_string());
        }
    }

    let body = response.text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(HttpResponse {
        status,
        body,
        headers,
    })
}

/// Execute OData query and return parsed JSON
/// Handles both array [...] and object { value: [...] } response formats from Nimbus
#[tauri::command]
pub async fn execute_odata_query(
    base_url: String,
    entity: String,
    top: Option<i32>,
    skip: Option<i32>,
    filter: Option<String>,
    select: Option<String>,
    expand: Option<String>,
    orderby: Option<String>,
    count: Option<bool>,
    user_id: Option<i32>,
    auth_token: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<Value, String> {
    let client = build_client(timeout_seconds)?;

    // Build OData URL - Use /CoreApi/OData/ which returns adhoc fields with $select
    // Legacy /ODataApi/ does NOT return adhoc fields even with $select
    let odata_base = if base_url.ends_with("/CoreApi/OData") || base_url.ends_with("/CoreApi/OData/") {
        base_url.trim_end_matches('/').to_string()
    } else if base_url.ends_with("/ODataApi") || base_url.ends_with("/ODataApi/") {
        // Convert legacy endpoint to CoreApi
        base_url.replace("/ODataApi", "/CoreApi/OData").trim_end_matches('/').to_string()
    } else if base_url.ends_with("/odata") || base_url.ends_with("/odata/") {
        base_url.trim_end_matches('/').to_string()
    } else {
        format!("{}/CoreApi/OData", base_url.trim_end_matches('/'))
    };

    let mut url = format!("{}/{}", odata_base, entity);
    let mut query_params: Vec<String> = Vec::new();

    if let Some(top) = top {
        query_params.push(format!("$top={}", top));
    }

    if let Some(skip) = skip {
        query_params.push(format!("$skip={}", skip));
    }

    if let Some(ref f) = filter {
        if !f.is_empty() {
            // Don't URL encode - OData handles this
            query_params.push(format!("$filter={}", f));
        }
    }

    if let Some(ref s) = select {
        if !s.is_empty() {
            query_params.push(format!("$select={}", s));
        }
    }

    if let Some(ref e) = expand {
        if !e.is_empty() {
            query_params.push(format!("$expand={}", e));
        }
    }

    if let Some(ref ob) = orderby {
        if !ob.is_empty() {
            query_params.push(format!("$orderby={}", ob));
        }
    }

    if count.unwrap_or(false) {
        query_params.push("$count=true".to_string());
    }

    if !query_params.is_empty() {
        url = format!("{}?{}", url, query_params.join("&"));
    }

    let headers = build_headers(None, user_id, auth_token)?;

    // Log the URL for debugging
    println!("OData query URL: {}", url);

    let response = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("OData request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OData query failed with status {}: {}", status.as_u16(), body));
    }

    let body = response.text().await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let json: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse OData response as JSON: {}", e))?;

    Ok(json)
}

/// Execute REST GET and return HttpResponse
#[tauri::command]
pub async fn execute_rest_get(
    url: Option<String>,
    base_url: Option<String>,
    endpoint: Option<String>,
    headers: Option<HashMap<String, String>>,
    user_id: Option<i32>,
    auth_token: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<HttpResponse, String> {
    let client = build_client(timeout_seconds)?;

    let full_url = if let Some(u) = url {
        u
    } else if let Some(base) = base_url {
        if let Some(ep) = endpoint {
            format!("{}{}", base.trim_end_matches('/'), ep)
        } else {
            base
        }
    } else if let Some(ep) = endpoint {
        ep
    } else {
        return Err("No URL provided. Pass 'url' or 'baseUrl' (optionally with 'endpoint')".to_string());
    };

    let req_headers = build_headers(headers, user_id, auth_token)?;

    let response = client
        .get(&full_url)
        .headers(req_headers)
        .send()
        .await
        .map_err(|e| format!("GET request failed: {}", e))?;

    response_to_http_response(response).await
}

/// Execute REST POST and return HttpResponse (used for authentication)
#[tauri::command]
pub async fn execute_rest_post(
    url: Option<String>,
    base_url: Option<String>,
    endpoint: Option<String>,
    body: Value,
    headers: Option<HashMap<String, String>>,
    user_id: Option<i32>,
    auth_token: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<HttpResponse, String> {
    let client = build_client(timeout_seconds)?;

    let full_url = if let Some(u) = url {
        u
    } else if let Some(base) = base_url {
        if let Some(ep) = endpoint {
            format!("{}{}", base.trim_end_matches('/'), ep)
        } else {
            base
        }
    } else if let Some(ep) = endpoint {
        ep
    } else {
        return Err("No URL provided. Pass 'url' or 'baseUrl' (optionally with 'endpoint')".to_string());
    };

    let req_headers = build_headers(headers, user_id, auth_token)?;

    let response = client
        .post(&full_url)
        .headers(req_headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("POST request failed: {}", e))?;

    response_to_http_response(response).await
}
