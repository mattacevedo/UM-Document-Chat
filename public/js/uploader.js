const form = document.getElementById('uploadForm');
const loadingElement = document.getElementById('loading');

function processDocument() {
    event.preventDefault();

    // Show the spinner
    loadingElement.style.display = 'block';
    form.style.display = 'none';

    const formData = new FormData(form);
    
    fetch('/uploaddocument', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        // Hide the spinner
        loadingElement.style.display = 'none';
        
        // Redirect to root
        window.location.href = "/";
    })
    .catch(error => {
        // Hide the spinner
        loadingElement.style.display = 'none';
        form.style.display = '';

        // If you had an error display element, you could add logic to display the error message here
        console.error('Error processing the document.');
    });
}
