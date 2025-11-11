document.getElementById('registrationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');
    const errorMessage = document.getElementById('errorMessage');
    
    // Get form values
    const name = document.getElementById('name').value.trim();
    const countryCode = document.getElementById('countryCode').value;
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    const homeAirport = document.getElementById('homeAirport').value;
    
    // Validate phone number (10 digits)
    if (!/^\d{10}$/.test(phone)) {
        showError('Please enter a valid 10-digit phone number');
        return;
    }
    
    // Format phone number with country code
    const phoneNumber = `${countryCode}${phone}`;
    
    // Show loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';
    errorMessage.style.display = 'none';
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phone_number: phoneNumber,
                name: name,
                email: email,
                home_airport: homeAirport
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }
        
        // Redirect to success page
        window.location.href = `/success.html?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phoneNumber)}&airport=${encodeURIComponent(homeAirport)}`;
        
    } catch (error) {
        console.error('Registration error:', error);
        showError(error.message || 'Something went wrong. Please try again.');
        
        // Reset button state
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    }
});

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    
    // Scroll to error
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Phone input validation
document.getElementById('phone').addEventListener('input', (e) => {
    // Only allow digits
    e.target.value = e.target.value.replace(/\D/g, '');
});
